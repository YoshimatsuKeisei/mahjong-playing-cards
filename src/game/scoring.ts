import type { Card, GameResult, Player, ScoreResult, WinningResult } from "../types";
import { analyzeHandForWin, findPossibleMelds, getCardPenalty } from "./rules";

export function calculateCardLoss(card: Card): number {
  return getCardPenalty(card);
}

export function calculateScoreFromLosses(loserLoss: number, winnerLoss: number): number {
  return Math.max(0, loserLoss - winnerLoss) * 100;
}

export function calculateRawScoreFromLosses(loserLoss: number, winnerLoss: number): number {
  return Math.max(0, loserLoss - winnerLoss);
}

export function calculateRawTsumoScoreFromLosses(playerLosses: number[], winnerIndex: number): number {
  const winnerLoss = playerLosses[winnerIndex] ?? 0;
  const loserLosses = playerLosses.filter((_, index) => index !== winnerIndex);
  if (loserLosses.length === 0) return 0;

  const totalLoserLoss = loserLosses.reduce((sum, loss) => sum + loss, 0);
  return Math.max(0, Math.round(totalLoserLoss / loserLosses.length - winnerLoss));
}

export function calculateRawWinnerScore(result: GameResult): number {
  const winnerLoss = result.score.playerLosses[result.winnerIndex] ?? 0;

  if (result.winType === "ron" && result.discarderIndex !== null) {
    const discarderLoss = result.score.playerLosses[result.discarderIndex] ?? 0;
    return calculateRawScoreFromLosses(discarderLoss, winnerLoss);
  }

  return calculateRawTsumoScoreFromLosses(result.score.playerLosses, result.winnerIndex);
}

export function calculateRawRoundScores(result: GameResult, playerCount: number): number[] {
  const scores = Array.from({ length: playerCount }, () => 0);

  if (result.winType === "ron" && result.discarderIndex !== null) {
    const ronResults = result.ronResults ?? [
      {
        winnerIndex: result.winnerIndex,
        winningResult: result.winningResult,
        score: result.score,
      },
    ];

    for (const ronResult of ronResults) {
      const winnerLoss = ronResult.score.playerLosses[ronResult.winnerIndex] ?? 0;
      const discarderLoss = ronResult.score.playerLosses[result.discarderIndex] ?? 0;
      scores[ronResult.winnerIndex] += calculateRawScoreFromLosses(discarderLoss, winnerLoss);
    }

    return scores;
  }

  scores[result.winnerIndex] = calculateRawWinnerScore(result);
  return scores;
}

export function calculatePointDeductions(result: GameResult, playerCount: number): number[] {
  const deductions = Array.from({ length: playerCount }, () => 0);

  if (result.winType === "ron" && result.discarderIndex !== null) {
    const ronResults = result.ronResults ?? [
      {
        winnerIndex: result.winnerIndex,
        winningResult: result.winningResult,
        score: result.score,
      },
    ];

    for (const ronResult of ronResults) {
      const winnerLoss = ronResult.score.playerLosses[ronResult.winnerIndex] ?? 0;
      const discarderLoss = ronResult.score.playerLosses[result.discarderIndex] ?? 0;
      deductions[result.discarderIndex] += calculateRawScoreFromLosses(discarderLoss, winnerLoss);
    }

    return deductions;
  }

  const tsumoDeduction = calculateRawTsumoScoreFromLosses(result.score.playerLosses, result.winnerIndex);
  result.score.playerLosses.forEach((loss, index) => {
    if (index !== result.winnerIndex) {
      deductions[index] = tsumoDeduction;
    }
  });

  return deductions;
}

export function getRonLoserIndexes(discarderIndex: number): number[] {
  return [discarderIndex];
}

export function getTsumoLoserIndexes(players: Player[], winnerIndex: number): number[] {
  return players.map((_, index) => index).filter((index) => index !== winnerIndex);
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
  const winnerScore = calculateRawTsumoScoreFromLosses(playerLosses, winnerIndex) * 100;

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
  const winnerScore = calculateScoreFromLosses(playerLosses[discarderIndex], playerLosses[winnerIndex]);

  return {
    winnerScore,
    playerLosses,
  };
}
