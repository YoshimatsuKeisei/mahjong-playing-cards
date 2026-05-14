import type { Card, WinningDiscardOption, WinningResult } from "../types";

const emptyWin: WinningResult = {
  canWin: false,
  melds: [],
  keyCard: null,
};

export function getCardPenalty(card: Card): number {
  if (card.rank >= 11) return 10;
  return card.rank;
}

export function isRun(cards: Card[]): boolean {
  if (cards.length !== 3) return false;
  const [first] = cards;
  if (!cards.every((card) => card.suit === first.suit)) return false;

  const ranks = cards.map((card) => card.rank).sort((a, b) => a - b);
  return ranks[0] + 1 === ranks[1] && ranks[1] + 1 === ranks[2];
}

export function isTriple(cards: Card[]): boolean {
  if (cards.length !== 3) return false;
  return cards.every((card) => card.rank === cards[0].rank);
}

export function findPossibleMelds(cards: Card[]): Card[][] {
  const melds: Card[][] = [];

  for (let i = 0; i < cards.length - 2; i += 1) {
    for (let j = i + 1; j < cards.length - 1; j += 1) {
      for (let k = j + 1; k < cards.length; k += 1) {
        const group = [cards[i], cards[j], cards[k]];
        if (isRun(group) || isTriple(group)) {
          melds.push(group);
        }
      }
    }
  }

  return melds;
}

function removeCards(source: Card[], cardsToRemove: Card[]): Card[] {
  const removeIds = new Set(cardsToRemove.map((card) => card.id));
  return source.filter((card) => !removeIds.has(card.id));
}

export function countMaxMelds(cards: Card[]): number {
  const possibleMelds = findPossibleMelds(cards);
  let maxCount = 0;

  for (const meld of possibleMelds) {
    const rest = removeCards(cards, meld);
    maxCount = Math.max(maxCount, 1 + countMaxMelds(rest));
  }

  return maxCount;
}

function chooseBetterResult(current: WinningResult | null, candidate: WinningResult | null): WinningResult | null {
  if (!candidate) return current;
  if (!current) return candidate;

  const currentPenalty = current.keyCard ? getCardPenalty(current.keyCard) : Number.POSITIVE_INFINITY;
  const candidatePenalty = candidate.keyCard ? getCardPenalty(candidate.keyCard) : Number.POSITIVE_INFINITY;
  return candidatePenalty < currentPenalty ? candidate : current;
}

function searchBestMelds(cards: Card[], targetMeldCount: number, chosen: Card[][]): WinningResult | null {
  if (chosen.length === targetMeldCount) {
    if (cards.length === 1) {
      return {
        canWin: true,
        melds: chosen,
        keyCard: cards[0],
      };
    }
    return null;
  }

  let best: WinningResult | null = null;
  const possibleMelds = findPossibleMelds(cards);
  for (const meld of possibleMelds) {
    const rest = removeCards(cards, meld);
    const found = searchBestMelds(rest, targetMeldCount, [...chosen, meld]);
    best = chooseBetterResult(best, found);
  }

  return best;
}

export function analyzeHandForWin(handCards: Card[], openMelds: Card[][] = []): WinningResult {
  const remainingMeldCount = 3 - openMelds.length;
  if (remainingMeldCount < 0) return emptyWin;
  if (handCards.length !== remainingMeldCount * 3 + 1) return emptyWin;

  const found = searchBestMelds(handCards, remainingMeldCount, []);
  if (!found) return emptyWin;

  return {
    canWin: true,
    melds: [...openMelds, ...found.melds],
    keyCard: found.keyCard,
  };
}

export function checkWinningHand(cards: Card[]): WinningResult {
  if (cards.length !== 10) return emptyWin;

  return analyzeHandForWin(cards);
}

export function checkWinningHandWithOpenMelds(handCards: Card[], openMelds: Card[][]): WinningResult {
  return analyzeHandForWin(handCards, openMelds);
}

export function findWinningDiscardsAfterDraw(
  cards: Card[],
  drawnCardId: string,
  openMelds: Card[][] = [],
): WinningDiscardOption[] {
  const options: WinningDiscardOption[] = [];

  for (const discardCard of cards) {
    const remaining = cards.filter((card) => card.id !== discardCard.id);
    if (!remaining.some((card) => card.id === drawnCardId)) continue;

    const winningResult =
      openMelds.length > 0 ? checkWinningHandWithOpenMelds(remaining, openMelds) : checkWinningHand(remaining);

    if (winningResult.canWin) {
      options.push({ discardCard, winningResult });
    }
  }

  return options.sort((a, b) => {
    const penaltyA = a.winningResult.keyCard ? getCardPenalty(a.winningResult.keyCard) : Number.POSITIVE_INFINITY;
    const penaltyB = b.winningResult.keyCard ? getCardPenalty(b.winningResult.keyCard) : Number.POSITIVE_INFINITY;
    return penaltyA - penaltyB;
  });
}

export function canCallWithDiscard(hand: Card[], discard: Card): boolean {
  return findCallMeldOptions(hand, discard).length > 0;
}

export function findCallMeldOptions(hand: Card[], discard: Card): Card[][] {
  const options: Card[][] = [];

  for (let i = 0; i < hand.length - 1; i += 1) {
    for (let j = i + 1; j < hand.length; j += 1) {
      const meld = [hand[i], hand[j], discard];
      if (isRun(meld) || isTriple(meld)) {
        options.push(meld);
      }
    }
  }

  return options;
}

export function canDeclareReach(hand: Card[], hasCalled: boolean, isReach: boolean): boolean {
  return !hasCalled && !isReach && hand.length === 10 && countMaxMelds(hand) >= 2;
}

export function canDeclareReachAfterDraw(hand: Card[], hasCalled: boolean, isReach: boolean): boolean {
  return !hasCalled && !isReach && hand.length === 11 && countMaxMelds(hand) >= 2;
}
