import type { Card } from "../types";
import { getAvailableDiscardSources, getCallOptionsForSource, getNextPlayerIndex } from "./gameState";
import { canDeclareReachAfterDraw, countMaxMelds, findPossibleMelds, getCardPenalty } from "./rules";
import type { CpuCallChoice, CpuDecisionContext, CpuModel } from "./cpuTypes";
import {
  getCpuDiscardCandidates,
  scoreStandardDiscardCandidate,
  standardChooseCpuCall,
  standardChooseCpuWinningDiscard,
  standardShouldCpuWin,
} from "./standardCpu";
import {
  chooseStandardDaifugoCard,
  chooseStandardDaifugoEffectActivation,
  chooseStandardQueenRank,
} from "./daifugoCpu";

interface TacticalScoreBreakdown {
  card: Card;
  score: number;
  notes: string[];
}

export function tacticalChooseCpuCall(context: CpuDecisionContext): CpuCallChoice | null {
  const standardCall = standardChooseCpuCall(context);
  if (!standardCall) return null;

  const { currentPlayer: player } = context;
  if (isAlreadyOpenMeld(player.openMelds, standardCall.meld)) return null;

  const currentMeldCount = countMaxMelds(player.hand) + player.openMelds.length;
  const handAfterCall = getHandAfterCall(player.hand, standardCall.meld);
  const nextMeldCount = countMaxMelds(handAfterCall) + player.openMelds.length + 1;

  if (nextMeldCount > currentMeldCount) {
    return standardCall;
  }

  return null;
}

export function tacticalShouldCpuCall(context: CpuDecisionContext): boolean {
  return tacticalChooseCpuCall(context) !== null;
}

export function tacticalChooseCpuDrawSource(context: CpuDecisionContext) {
  const call = tacticalChooseCpuCall(context);
  if (call) {
    return { type: "takeDiscard" as const, ownerIndex: call.ownerIndex, meld: call.meld };
  }
  return { type: "drawFromDeck" as const };
}

export function tacticalChooseCpuDiscardCard(context: CpuDecisionContext): Card | null {
  const scores = getTacticalDiscardScores(context);
  if (scores.length === 0) return null;
  return scores[0].card;
}

export function getTacticalDiscardScores(context: CpuDecisionContext): TacticalScoreBreakdown[] {
  const legalCards = getCpuDiscardCandidates(context);
  const handShape = analyzeHandShape(legalCards, context);

  return legalCards
    .map((card) => scoreTacticalDiscardCandidate(card, legalCards, context, handShape))
    .sort((a, b) => b.score - a.score || a.card.id.localeCompare(b.card.id));
}

export function scoreTacticalDiscardCandidate(
  card: Card,
  hand: Card[],
  context: CpuDecisionContext,
  handShape = analyzeHandShape(hand, context),
): TacticalScoreBreakdown {
  let score = scoreStandardDiscardCandidate(card, hand);
  const notes = [`standard ${formatSigned(score)}`];

  const highPoint = getCardPenalty(card) * (handShape.isNearWin ? 0.2 : 0.5);
  score += highPoint;
  notes.push(`${formatSigned(highPoint)} highPoint`);

  const safeRankCount = getSafeRankCount(card.rank, context);
  if (safeRankCount > 0) {
    const safeBonus = Math.min(handShape.isNearWin ? 12 : 24, safeRankCount === 1 ? 10 : 16 + safeRankCount * 4);
    score += safeBonus;
    notes.push(`${formatSigned(safeBonus)} safeRank(${safeRankCount})`);
  }

  const pairCount = hand.filter((candidate) => candidate.rank === card.rank).length;
  if (pairCount >= 2) {
    const pairPenalty = handShape.isNearWin ? -42 : -30;
    score += pairPenalty;
    notes.push(`${formatSigned(pairPenalty)} pairCandidate`);
  }

  const runCandidateCount = countRunCandidateLinks(card, hand);
  if (runCandidateCount > 0) {
    const runPenalty = (handShape.isNearWin ? -14 : -9) * runCandidateCount;
    score += runPenalty;
    notes.push(`${formatSigned(runPenalty)} runCandidate(${runCandidateCount})`);
  }

  if (isInStrongMeldCandidate(card, hand)) {
    const meldPenalty = handShape.isNearWin ? -30 : -20;
    score += meldPenalty;
    notes.push(`${formatSigned(meldPenalty)} meldCandidate`);
  }

  if (isHighPairDefenseCandidate(card, hand, handShape)) {
    const pairDefenseBonus = handShape.hasClearIsolatedCard ? 0 : 6;
    score += pairDefenseBonus;
    notes.push(`${formatSigned(pairDefenseBonus)} highPairFallback`);
  }

  if (isIsolated(card, hand)) {
    const isolatedBonus = 22;
    score += isolatedBonus;
    notes.push(`${formatSigned(isolatedBonus)} isolated`);
  }

  return { card, score, notes };
}

export function getTacticalDiscardDebugInfo(context: CpuDecisionContext): string | null {
  const scores = getTacticalDiscardScores(context);
  if (scores.length === 0) return null;
  return [
    `[Tactical CPU] discard scores for ${context.currentPlayer.name}:`,
    ...scores.map((item) => `${formatCard(item.card)}: ${item.score.toFixed(1)} (${item.notes.join(", ")})`),
    `selected: ${formatCard(scores[0].card)}`,
  ].join("\n");
}

export function describeTacticalDiscardChoice(context: CpuDecisionContext, card: Card): string | null {
  const chosen = getTacticalDiscardScores(context).find((item) => item.card.id === card.id);
  if (!chosen) return null;
  if (chosen.notes.some((note) => note.includes("safeRank"))) {
    return `${context.currentPlayer.name}（CPU/Tactical）は安全候補を少し加味して ${formatCard(card)} を捨てました。`;
  }
  if (chosen.notes.some((note) => note.includes("highPairFallback"))) {
    return `${context.currentPlayer.name}（CPU/Tactical）は他に候補が薄いため ${formatCard(card)} を捨てました。`;
  }
  return null;
}

export function describeTacticalCallSkip(context: CpuDecisionContext): string | null {
  if (context.state.phase !== "draw" || tacticalChooseCpuCall(context)) return null;
  const ownerIndex = getAvailableDiscardSources(context.state)[0];
  if (ownerIndex === undefined) return null;
  const options = getCallOptionsForSource(context.state, ownerIndex);
  if (options.length === 0) return null;

  const reason = options.some((meld) => isAlreadyOpenMeld(context.currentPlayer.openMelds, meld))
    ? "same meld already completed"
    : "meld count/candidates did not improve";
  return `[Tactical CPU] skipped call: ${reason}`;
}

function analyzeHandShape(hand: Card[], context: CpuDecisionContext) {
  const completedMeldCount = context.currentPlayer.openMelds.length + countMaxMelds(hand);
  const isReachReady = canDeclareReachAfterDraw(hand, context.currentPlayer.hasCalled, context.currentPlayer.isReach);
  const meldCandidates = findPossibleMelds(hand);
  const hasClearIsolatedCard = hand.some((card) => isIsolated(card, hand));

  return {
    completedMeldCount,
    isNearWin: completedMeldCount >= 2 || isReachReady || meldCandidates.length >= 3,
    hasClearIsolatedCard,
  };
}

function getHandAfterCall(hand: Card[], meld: Card[]): Card[] {
  const discard = meld.find((card) => !hand.some((handCard) => handCard.id === card.id));
  if (!discard) return hand;
  const handUsedIds = new Set(meld.filter((card) => card.id !== discard.id).map((card) => card.id));
  return hand.filter((card) => !handUsedIds.has(card.id));
}

function getSafeRankCount(rank: number, context: CpuDecisionContext): number {
  const watchIndexes = getWatchPlayerIndexes(context);
  return watchIndexes.reduce((count, playerIndex) => {
    return count + context.state.players[playerIndex].discardPile.filter((card) => card.rank === rank).length;
  }, 0);
}

function getWatchPlayerIndexes(context: CpuDecisionContext): number[] {
  const indexes = new Set<number>();
  context.state.players.forEach((player, index) => {
    if (index !== context.currentPlayerIndex && player.isReach) {
      indexes.add(index);
    }
  });

  const previousIndex = getNextPlayerIndex(
    context.currentPlayerIndex,
    context.state.players.length,
    context.state.direction === "clockwise" ? "counterclockwise" : "clockwise",
  );
  const previousPlayer = context.state.players[previousIndex];
  if (previousPlayer && previousPlayer.openMelds.length >= 2) {
    indexes.add(previousIndex);
  }

  return [...indexes];
}

function isHighPairDefenseCandidate(card: Card, hand: Card[], handShape: ReturnType<typeof analyzeHandShape>): boolean {
  if (handShape.isNearWin || handShape.hasClearIsolatedCard) return false;
  if (handShape.completedMeldCount < 1) return false;
  const pairRanks = [...new Set(hand.map((candidate) => candidate.rank))].filter((rank) => {
    return hand.filter((candidate) => candidate.rank === rank).length >= 2;
  });
  if (pairRanks.length < 2) return false;
  return card.rank === Math.max(...pairRanks);
}

function isInStrongMeldCandidate(card: Card, hand: Card[]): boolean {
  return findPossibleMelds(hand).some((meld) => meld.some((candidate) => candidate.id === card.id));
}

function countRunCandidateLinks(card: Card, hand: Card[]): number {
  return hand.filter((candidate) => candidate.id !== card.id && candidate.suit === card.suit && Math.abs(candidate.rank - card.rank) <= 2).length;
}

function isIsolated(card: Card, hand: Card[]): boolean {
  const sameRankCount = hand.filter((candidate) => candidate.id !== card.id && candidate.rank === card.rank).length;
  return sameRankCount === 0 && countRunCandidateLinks(card, hand) === 0;
}

function isAlreadyOpenMeld(openMelds: Card[][], meld: Card[]): boolean {
  const signature = meldSignature(meld);
  return openMelds.some((openMeld) => meldSignature(openMeld) === signature);
}

function meldSignature(meld: Card[]): string {
  return meld.map((card) => `${card.suit}-${card.rank}`).sort().join("|");
}

function formatCard(card: Card): string {
  return `${card.rank}${card.suit}`;
}

function formatSigned(value: number): string {
  return value >= 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
}

export const tacticalCpuModel: CpuModel = {
  id: "tactical",
  name: "Tactical CPU",
  chooseWinningDiscard: standardChooseCpuWinningDiscard,
  shouldWin: standardShouldCpuWin,
  chooseCall: tacticalChooseCpuCall,
  shouldCall: tacticalShouldCpuCall,
  chooseDrawSource: tacticalChooseCpuDrawSource,
  chooseDiscardCard: tacticalChooseCpuDiscardCard,
  chooseDaifugoEffectActivation: chooseStandardDaifugoEffectActivation,
  chooseDaifugoSevenExchangeCard: (context, candidates) => chooseStandardDaifugoCard(context, candidates),
  chooseQueenVanishRank: chooseStandardQueenRank,
  chooseDaifugoExtraDiscard: (context, _effect, candidates) => chooseStandardDaifugoCard(context, candidates),
  getDiscardDebugInfo: getTacticalDiscardDebugInfo,
  describeDiscardChoice: describeTacticalDiscardChoice,
  describeCallSkip: describeTacticalCallSkip,
};
