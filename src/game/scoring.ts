import type { Card, Player, ScoreResult, WinningResult } from "../types";
import { analyzeHandForWin, findPossibleMelds, getCardPenalty } from "./rules";

export function calculateCardLoss(card: Card): number {
  return getCardPenalty(card);
}

function removeCards(source: Card[], cardsToRemove: Card[]): Card[] {
  const removeIds = new Set(cardsToRemove.map((card) => card.id));
  return source.filter((card) => !removeIds.has(card.id));
}

function sumCardLoss(cards: Card[]): number {
  return cards.reduce((total, card) => total + calculateCardLoss(card), 0);
}

function chooseBetterRemainder(current: Card[] | null, candidate: Card[]): Card[] {
  if (!current) return candidate;
  if (candidate.length < current.length) return candidate;
  if (candidate.length > current.length) return current;

  const currentPenalty = sumCardLoss(current);
  const candidatePenalty = sumCardLoss(candidate);
  return candidatePenalty < currentPenalty ? candidate : current;
}

function findBestRemainderAfterMelds(cards: Card[], meldsToRemove: number): Card[] {
  if (meldsToRemove <= 0 || cards.length < 3) return cards;

  let best: Card[] | null = null;
  for (const meld of findPossibleMelds(cards)) {
    const rest = removeCards(cards, meld);
    const candidate = findBestRemainderAfterMelds(rest, meldsToRemove - 1);
    best = chooseBetterRemainder(best, candidate);
  }

  return best ?? cards;
}

function fallbackLossForPlayer(player: Player): number {
  const cards = player.hand.length > 0 ? player.hand : player.discardPile;
  if (cards.length === 0) return 0;

  const meldsToRemove = Math.max(0, 3 - player.openMelds.length);
  const remainder = findBestRemainderAfterMelds(cards, meldsToRemove);
  if (remainder.length === 0) return 0;
  return sumCardLoss(remainder);
}

function getPlayerLoss(player: Player): number {
  const keyCard = player.winningResult?.keyCard;
  return keyCard ? calculateCardLoss(keyCard) : fallbackLossForPlayer(player);
}

export function calculateLosses(players: Player[], winnerIndex: number, winningResult?: WinningResult): number[] {
  return players.map((player, index) => {
    if (index === winnerIndex && winningResult?.keyCard) {
      return calculateCardLoss(winningResult.keyCard);
    }
    const loserWinCheck = analyzeHandForWin(player.hand, player.openMelds);
    if (loserWinCheck.canWin) {
      console.warn("Loser hand is already complete; check turn win handling.", {
        playerIndex: index,
        keyCard: loserWinCheck.keyCard,
        melds: loserWinCheck.melds,
      });
    }
    return getPlayerLoss(player);
  });
}

export function calculateTsumoScore(players: Player[], winnerIndex: number, winningResult?: WinningResult): ScoreResult {
  const playerLosses = calculateLosses(players, winnerIndex, winningResult);
  const winnerLoss = playerLosses[winnerIndex];
  const totalOtherLoss = playerLosses.reduce((sum, loss) => sum + loss, 0) - winnerLoss;
  const winnerScore = Math.max(0, Math.round((totalOtherLoss / (players.length - 1) - winnerLoss) * 100));

  return {
    winnerScore,
    playerLosses,
  };
}

export function calculateRonScore(
  players: Player[],
  winnerIndex: number,
  discarderIndex: number,
  winningResult?: WinningResult,
): ScoreResult {
  const playerLosses = calculateLosses(players, winnerIndex, winningResult);
  const winnerScore = Math.max(0, (playerLosses[discarderIndex] - playerLosses[winnerIndex]) * 100);

  return {
    winnerScore,
    playerLosses,
  };
}
