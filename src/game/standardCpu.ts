import type { Card } from "../types";
import { getAvailableDiscardSources, getCallOptionsForSource, getReachWinningOptions } from "./gameState";
import { findWinningDiscardsAfterDraw, getCardPenalty } from "./rules";
import type { CpuCallChoice, CpuDecisionContext, CpuModel } from "./cpuTypes";

export function standardShouldCpuWin(context: CpuDecisionContext): boolean {
  return standardChooseCpuWinningDiscard(context) !== null;
}

export function standardChooseCpuWinningDiscard(context: CpuDecisionContext): Card | null {
  const { currentPlayer: player, state } = context;
  if (state.phase !== "discard" || !state.drawnCard) return null;

  const options = player.isReach
    ? getReachWinningOptions(state)
    : findWinningDiscardsAfterDraw(player.hand, state.drawnCard.id, player.openMelds);
  return options[0]?.discardCard ?? null;
}

export function standardShouldCpuCall(context: CpuDecisionContext): boolean {
  return standardChooseCpuCall(context) !== null;
}

export function standardChooseCpuCall(context: CpuDecisionContext): CpuCallChoice | null {
  const { currentPlayer: player, state } = context;
  if (state.phase !== "draw" || player.isReach) return null;

  const ownerIndex = getAvailableDiscardSources(state)[0];
  if (ownerIndex === undefined) return null;

  const meld = getCallOptionsForSource(state, ownerIndex)[0];
  return meld ? { ownerIndex, meld } : null;
}

export function standardChooseCpuDrawSource(context: CpuDecisionContext) {
  const call = standardChooseCpuCall(context);
  if (call) {
    return { type: "takeDiscard" as const, ownerIndex: call.ownerIndex, meld: call.meld };
  }
  return { type: "drawFromDeck" as const };
}

export function standardChooseCpuDiscardCard(context: CpuDecisionContext): Card | null {
  const { state } = context;
  if (state.phase !== "discard") return null;

  const legalCards = getCpuDiscardCandidates(context);
  if (legalCards.length === 0) return null;

  return [...legalCards].sort((a, b) => scoreStandardDiscardCandidate(b, legalCards) - scoreStandardDiscardCandidate(a, legalCards) || a.id.localeCompare(b.id))[0];
}

export function getCpuDiscardCandidates(context: CpuDecisionContext): Card[] {
  const { currentPlayer: player, state } = context;
  if (player.isReach && !state.declaredReachThisTurn) {
    return state.drawnCard ? [state.drawnCard] : [];
  }
  return player.hand;
}

export function scoreStandardDiscardCandidate(card: Card, hand: Card[]): number {
  const sameRankCount = hand.filter((candidate) => candidate.rank === card.rank && candidate.id !== card.id).length;
  const neighborCount = hand.filter((candidate) => {
    return candidate.suit === card.suit && candidate.id !== card.id && Math.abs(candidate.rank - card.rank) <= 2;
  }).length;
  const suitCount = hand.filter((candidate) => candidate.suit === card.suit && candidate.id !== card.id).length;
  const highCardPenalty = getCardPenalty(card);

  return highCardPenalty * 2 - sameRankCount * 8 - neighborCount * 4 - suitCount;
}

export const standardCpuModel: CpuModel = {
  id: "standard",
  name: "Standard CPU",
  chooseWinningDiscard: standardChooseCpuWinningDiscard,
  shouldWin: standardShouldCpuWin,
  chooseCall: standardChooseCpuCall,
  shouldCall: standardShouldCpuCall,
  chooseDrawSource: standardChooseCpuDrawSource,
  chooseDiscardCard: standardChooseCpuDiscardCard,
};
