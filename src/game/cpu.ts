import type { Card, GameState } from "../types";
import { getAvailableDiscardSources, getCallOptionsForSource, getReachWinningOptions, type GameAction } from "./gameState";
import { findWinningDiscardsAfterDraw, getCardPenalty } from "./rules";

export const CPU_THINK_DELAY_MS = 900;
export const CPU_AFTER_DRAW_DELAY_MS = 650;
export const CPU_DISCARD_DELAY_MS = 900;
export const CPU_DECISION_DELAY_MS = 900;

export function shouldCpuWin(state: GameState): boolean {
  return chooseCpuWinningDiscard(state) !== null;
}

export function chooseCpuWinningDiscard(state: GameState): Card | null {
  const player = state.players[state.currentPlayerIndex];
  if (!player || state.phase !== "discard" || !state.drawnCard) return null;

  const options = player.isReach
    ? getReachWinningOptions(state)
    : findWinningDiscardsAfterDraw(player.hand, state.drawnCard.id, player.openMelds);
  return options[0]?.discardCard ?? null;
}

export function shouldCpuCall(state: GameState): boolean {
  return chooseCpuCall(state) !== null;
}

export function chooseCpuCall(state: GameState): { ownerIndex: number; meld: Card[] } | null {
  const player = state.players[state.currentPlayerIndex];
  if (!player || state.phase !== "draw" || player.isReach) return null;

  const ownerIndex = getAvailableDiscardSources(state)[0];
  if (ownerIndex === undefined) return null;

  const meld = getCallOptionsForSource(state, ownerIndex)[0];
  return meld ? { ownerIndex, meld } : null;
}

export function chooseCpuDrawSource(state: GameState): GameAction {
  const call = chooseCpuCall(state);
  if (call) {
    return { type: "takeDiscard", ownerIndex: call.ownerIndex, meld: call.meld };
  }
  return { type: "drawFromDeck" };
}

export function chooseCpuDiscardCard(state: GameState): Card | null {
  const player = state.players[state.currentPlayerIndex];
  if (!player || state.phase !== "discard") return null;

  const legalCards = getCpuDiscardCandidates(state);
  if (legalCards.length === 0) return null;

  return [...legalCards].sort((a, b) => scoreDiscardCandidate(b, legalCards) - scoreDiscardCandidate(a, legalCards) || a.id.localeCompare(b.id))[0];
}

function getCpuDiscardCandidates(state: GameState): Card[] {
  const player = state.players[state.currentPlayerIndex];
  if (!player) return [];
  if (player.isReach && !state.declaredReachThisTurn) {
    return state.drawnCard ? [state.drawnCard] : [];
  }
  return player.hand;
}

function scoreDiscardCandidate(card: Card, hand: Card[]): number {
  const sameRankCount = hand.filter((candidate) => candidate.rank === card.rank && candidate.id !== card.id).length;
  const neighborCount = hand.filter((candidate) => {
    return candidate.suit === card.suit && candidate.id !== card.id && Math.abs(candidate.rank - card.rank) <= 2;
  }).length;
  const suitCount = hand.filter((candidate) => candidate.suit === card.suit && candidate.id !== card.id).length;
  const highCardPenalty = getCardPenalty(card);

  return highCardPenalty * 2 - sameRankCount * 8 - neighborCount * 4 - suitCount;
}
