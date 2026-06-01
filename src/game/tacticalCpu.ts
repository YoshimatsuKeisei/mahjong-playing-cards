import type { Card } from "../types";
import { getAvailableDiscardSources, getCallOptionsForSource, getNextPlayerIndex } from "./gameState";
import { canDeclareReachAfterDraw, countMaxMelds, findPossibleMelds, getCardPenalty } from "./rules";
import type { CpuCallChoice, CpuDecisionContext, CpuModel } from "./cpuTypes";
import {
  getCpuDiscardCandidates,
  scoreStandardDiscardCandidate,
  standardChooseCpuCall,
  standardChooseCpuWinningDiscard,
  standardChooseReachDeclaration,
  standardShouldCpuWin,
} from "./standardCpu";
import {
  chooseDaifugoSevenExchangeCardForModel,
  chooseStandardDaifugoCard,
  chooseStandardDaifugoEffectActivation,
  chooseTacticalQueenRank,
} from "./daifugoCpu";

interface TacticalScoreBreakdown {
  card: Card;
  score: number;
  notes: string[];
}

interface TacticalDiscardPolicy {
  protectIncompleteRuns: boolean;
}

const NORMAL_DAIFUGO_EFFECT_BONUSES = {
  eightExtraTurn: 120,
  tenSwapDraw: 105,
  jackEnhancementRight: 90,
  nineReverse: 74,
  queenNumberVanish: 70,
  sevenExchange: 60,
  fiveSkip: 50,
  jackInspect: 20,
} as const;

const ADJACENT_REACH_EFFECT_BONUSES = {
  sevenExchange: 230,
  queenNumberVanish: 215,
  fiveSkip: 200,
  nineReverse: 165,
  eightExtraTurn: 145,
  tenSwapDraw: 130,
  jackInspect: 115,
} as const;

const REMOTE_REACH_EFFECT_BONUSES = {
  enhancedSevenExchange: 260,
  enhancedFiveSkip: 245,
  queenNumberVanish: 225,
  jackEnhancementRight: 190,
  eightExtraTurn: 170,
  tenSwapDraw: 155,
  sevenExchange: 140,
  nineReverse: 125,
  jackInspect: 110,
  fiveSkip: -20,
} as const;

const ADJACENT_TWO_CALL_EFFECT_BONUSES = {
  fiveSkip: 260,
  queenNumberVanish: 245,
  sevenExchange: 230,
  nineReverse: 165,
  eightExtraTurn: 145,
  tenSwapDraw: 130,
  jackInspect: 115,
} as const;

const REMOTE_TWO_CALL_EFFECT_BONUSES = {
  enhancedFiveSkip: 260,
  queenNumberVanish: 245,
  eightExtraTurn: 225,
  tenSwapDraw: 210,
  jackEnhancementRight: 195,
  enhancedSevenExchange: 180,
  sevenExchange: 160,
  nineReverse: 145,
  jackInspect: 125,
  fiveSkip: -20,
} as const;

const REACH_SAFE_RANK_BONUS = 180;
const TWO_CALL_SAFE_RANK_BONUS = 180;

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
  const policy = getDiscardPolicy(context);
  const handShape = analyzeHandShape(legalCards, context, policy);

  return legalCards
    .map((card) => scoreTacticalDiscardCandidate(card, legalCards, context, handShape, policy))
    .sort((a, b) => b.score - a.score || a.card.id.localeCompare(b.card.id));
}

export function scoreTacticalDiscardCandidate(
  card: Card,
  hand: Card[],
  context: CpuDecisionContext,
  handShape = analyzeHandShape(hand, context, getDiscardPolicy(context)),
  policy = getDiscardPolicy(context),
): TacticalScoreBreakdown {
  let score = scoreStandardDiscardCandidate(card, hand, {
    protectRunCandidates: policy.protectIncompleteRuns,
  });
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

  const runCandidateCount = policy.protectIncompleteRuns ? countRunCandidateLinks(card, hand) : 0;
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

  if (isIsolated(card, hand, policy)) {
    const isolatedBonus = 22;
    score += isolatedBonus;
    notes.push(`${formatSigned(isolatedBonus)} isolated`);
  }

  if (isNormalDaifugoEvaluation(context) || isReachDaifugoEvaluation(context) || isTwoCallDaifugoEvaluation(context)) {
    if (isInStrongMeldCandidate(card, hand)) {
      const completedMeldLock = -220;
      score += completedMeldLock;
      notes.push(`${formatSigned(completedMeldLock)} completedMeldLock`);
    }

    if (pairCount >= 2) {
      const pairProtection = -64;
      score += pairProtection;
      notes.push(`${formatSigned(pairProtection)} normalPairProtection`);
    }

    if (isIsolated(card, hand, policy)) {
      const singletonBonus = 20;
      score += singletonBonus;
      notes.push(`${formatSigned(singletonBonus)} normalSingleton`);
    }
  }

  if (isNormalDaifugoEvaluation(context)) {
    const effectBonus = getNormalDaifugoEffectBonus(card, context);
    if (effectBonus > 0) {
      score += effectBonus;
      notes.push(`${formatSigned(effectBonus)} normalDaifugoPriority`);
    }
  }

  if (isReachDaifugoEvaluation(context)) {
    if (safeRankCount > 0) {
      score += REACH_SAFE_RANK_BONUS;
      notes.push(`${formatSigned(REACH_SAFE_RANK_BONUS)} reachSafeRank`);
    }

    const effectBonus = getReachDaifugoEffectBonus(card, context);
    if (effectBonus !== 0) {
      score += effectBonus;
      notes.push(`${formatSigned(effectBonus)} reachDaifugoPriority`);
    }
  }

  if (isTwoCallDaifugoEvaluation(context)) {
    if (isAdjacentTwoCallThreat(context) && getTwoCallSafeRankCount(card.rank, context) > 0) {
      score += TWO_CALL_SAFE_RANK_BONUS;
      notes.push(`${formatSigned(TWO_CALL_SAFE_RANK_BONUS)} twoCallSafeRank`);
    }

    const effectBonus = getTwoCallDaifugoEffectBonus(card, context);
    if (effectBonus !== 0) {
      score += effectBonus;
      notes.push(`${formatSigned(effectBonus)} twoCallDaifugoPriority`);
    }
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

function getDiscardPolicy(context: CpuDecisionContext): TacticalDiscardPolicy {
  return {
    protectIncompleteRuns: context.currentPlayer.cpuModelId !== "master",
  };
}

function analyzeHandShape(hand: Card[], context: CpuDecisionContext, policy: TacticalDiscardPolicy) {
  const completedMeldCount = context.currentPlayer.openMelds.length + countMaxMelds(hand);
  const isReachReady = canDeclareReachAfterDraw(hand, context.currentPlayer.hasCalled, context.currentPlayer.isReach);
  const meldCandidates = findPossibleMelds(hand);
  const hasClearIsolatedCard = hand.some((card) => isIsolated(card, hand, policy));

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

function getTwoCallSafeRankCount(rank: number, context: CpuDecisionContext): number {
  return getTwoCallPlayerIndexes(context).reduce((count, playerIndex) => {
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

function isIsolated(card: Card, hand: Card[], policy: TacticalDiscardPolicy): boolean {
  const sameRankCount = hand.filter((candidate) => candidate.id !== card.id && candidate.rank === card.rank).length;
  if (sameRankCount > 0 || isInStrongMeldCandidate(card, hand)) return false;
  return !policy.protectIncompleteRuns || countRunCandidateLinks(card, hand) === 0;
}

function isNormalDaifugoEvaluation(context: CpuDecisionContext): boolean {
  return (
    context.state.phase === "discard" &&
    context.state.daifugoOptions.enabled &&
    getReachPlayerIndexes(context).length === 0 &&
    getTwoCallPlayerIndexes(context).length === 0
  );
}

function isReachDaifugoEvaluation(context: CpuDecisionContext): boolean {
  return context.state.phase === "discard" && context.state.daifugoOptions.enabled && getReachPlayerIndexes(context).length > 0;
}

function isTwoCallDaifugoEvaluation(context: CpuDecisionContext): boolean {
  return (
    context.state.phase === "discard" &&
    context.state.daifugoOptions.enabled &&
    getReachPlayerIndexes(context).length === 0 &&
    getTwoCallPlayerIndexes(context).length > 0
  );
}

function getReachPlayerIndexes(context: CpuDecisionContext): number[] {
  return context.state.players.flatMap((player, index) =>
    index !== context.currentPlayerIndex && player.isReach ? [index] : [],
  );
}

function getTwoCallPlayerIndexes(context: CpuDecisionContext): number[] {
  return context.state.players.flatMap((player, index) =>
    index !== context.currentPlayerIndex && player.openMelds.length >= 2 ? [index] : [],
  );
}

function isAdjacentReachThreat(context: CpuDecisionContext): boolean {
  const nextPlayerIndex = getNextPlayerIndex(
    context.currentPlayerIndex,
    context.state.players.length,
    context.state.direction,
  );
  return context.state.players[nextPlayerIndex]?.isReach ?? false;
}

function isAdjacentTwoCallThreat(context: CpuDecisionContext): boolean {
  const nextPlayerIndex = getNextPlayerIndex(
    context.currentPlayerIndex,
    context.state.players.length,
    context.state.direction,
  );
  return context.state.players[nextPlayerIndex]?.openMelds.length >= 2;
}

function canEnhancedFiveSkipTargets(context: CpuDecisionContext, targetPlayerIndexes: number[]): boolean {
  const previousPlayerIndex = getNextPlayerIndex(
    context.currentPlayerIndex,
    context.state.players.length,
    reverseTurnDirection(context.state.direction),
  );
  return targetPlayerIndexes.some((targetPlayerIndex) => targetPlayerIndex !== previousPlayerIndex);
}

function getTurnDistance(
  fromPlayerIndex: number,
  toPlayerIndex: number,
  playerCount: number,
  direction: CpuDecisionContext["state"]["direction"],
): number {
  let currentPlayerIndex = fromPlayerIndex;
  for (let distance = 1; distance < playerCount; distance += 1) {
    currentPlayerIndex = getNextPlayerIndex(currentPlayerIndex, playerCount, direction);
    if (currentPlayerIndex === toPlayerIndex) {
      return distance;
    }
  }
  return Number.POSITIVE_INFINITY;
}

function reverseTurnDirection(
  direction: CpuDecisionContext["state"]["direction"],
): CpuDecisionContext["state"]["direction"] {
  return direction === "clockwise" ? "counterclockwise" : "clockwise";
}

export function doesNineReverseIncreaseReachDistance(context: CpuDecisionContext): boolean {
  const reachPlayerIndexes = getReachPlayerIndexes(context);
  return doesNineReverseIncreaseTargetDistance(context, reachPlayerIndexes);
}

export function doesNineReverseIncreaseTwoCallDistance(context: CpuDecisionContext): boolean {
  const twoCallPlayerIndexes = getTwoCallPlayerIndexes(context);
  return getReachPlayerIndexes(context).length === 0 && doesNineReverseIncreaseTargetDistance(context, twoCallPlayerIndexes);
}

function doesNineReverseIncreaseTargetDistance(context: CpuDecisionContext, targetPlayerIndexes: number[]): boolean {
  if (targetPlayerIndexes.length === 0) return false;

  const getNearestTargetDistance = (direction: CpuDecisionContext["state"]["direction"]) =>
    Math.min(
      ...targetPlayerIndexes.map((targetPlayerIndex) =>
        getTurnDistance(
          context.currentPlayerIndex,
          targetPlayerIndex,
          context.state.players.length,
          direction,
        ),
      ),
    );

  return (
    getNearestTargetDistance(reverseTurnDirection(context.state.direction)) >
    getNearestTargetDistance(context.state.direction)
  );
}

function getReachDaifugoEffectBonus(card: Card, context: CpuDecisionContext): number {
  const effects = context.state.daifugoOptions.effects;
  const hasEnhancementRight = context.currentPlayer.hasJEnhancementRight;

  if (isAdjacentReachThreat(context)) {
    switch (card.rank) {
      case 5:
        return effects.fiveSkip ? ADJACENT_REACH_EFFECT_BONUSES.fiveSkip : 0;
      case 7:
        return effects.sevenExchange ? ADJACENT_REACH_EFFECT_BONUSES.sevenExchange : 0;
      case 8:
        return effects.eightExtraTurn ? ADJACENT_REACH_EFFECT_BONUSES.eightExtraTurn : 0;
      case 9:
        return effects.nineReverse && doesNineReverseIncreaseReachDistance(context)
          ? ADJACENT_REACH_EFFECT_BONUSES.nineReverse
          : 0;
      case 10:
        return effects.tenSwapDraw ? ADJACENT_REACH_EFFECT_BONUSES.tenSwapDraw : 0;
      case 11:
        return effects.jackBack ? ADJACENT_REACH_EFFECT_BONUSES.jackInspect : 0;
      case 12:
        return effects.queenNumberVanish ? ADJACENT_REACH_EFFECT_BONUSES.queenNumberVanish : 0;
      default:
        return 0;
    }
  }

  switch (card.rank) {
    case 5:
      return effects.fiveSkip
        ? hasEnhancementRight && canEnhancedFiveSkipTargets(context, getReachPlayerIndexes(context))
          ? REMOTE_REACH_EFFECT_BONUSES.enhancedFiveSkip
          : 0
        : 0;
    case 7:
      return effects.sevenExchange
        ? hasEnhancementRight
          ? REMOTE_REACH_EFFECT_BONUSES.enhancedSevenExchange
          : REMOTE_REACH_EFFECT_BONUSES.sevenExchange
        : 0;
    case 8:
      return effects.eightExtraTurn ? REMOTE_REACH_EFFECT_BONUSES.eightExtraTurn : 0;
    case 9:
      return effects.nineReverse && doesNineReverseIncreaseReachDistance(context)
        ? REMOTE_REACH_EFFECT_BONUSES.nineReverse
        : 0;
    case 10:
      return effects.tenSwapDraw ? REMOTE_REACH_EFFECT_BONUSES.tenSwapDraw : 0;
    case 11:
      if (!effects.jackBack) return 0;
      return hasEnhancementRight
        ? REMOTE_REACH_EFFECT_BONUSES.jackInspect
        : REMOTE_REACH_EFFECT_BONUSES.jackEnhancementRight;
    case 12:
      return effects.queenNumberVanish ? REMOTE_REACH_EFFECT_BONUSES.queenNumberVanish : 0;
    default:
      return 0;
  }
}

function getTwoCallDaifugoEffectBonus(card: Card, context: CpuDecisionContext): number {
  const effects = context.state.daifugoOptions.effects;
  const hasEnhancementRight = context.currentPlayer.hasJEnhancementRight;

  if (isAdjacentTwoCallThreat(context)) {
    switch (card.rank) {
      case 5:
        return effects.fiveSkip ? ADJACENT_TWO_CALL_EFFECT_BONUSES.fiveSkip : 0;
      case 7:
        return effects.sevenExchange ? ADJACENT_TWO_CALL_EFFECT_BONUSES.sevenExchange : 0;
      case 8:
        return effects.eightExtraTurn ? ADJACENT_TWO_CALL_EFFECT_BONUSES.eightExtraTurn : 0;
      case 9:
        return effects.nineReverse && doesNineReverseIncreaseTwoCallDistance(context)
          ? ADJACENT_TWO_CALL_EFFECT_BONUSES.nineReverse
          : 0;
      case 10:
        return effects.tenSwapDraw ? ADJACENT_TWO_CALL_EFFECT_BONUSES.tenSwapDraw : 0;
      case 11:
        return effects.jackBack && hasEnhancementRight ? ADJACENT_TWO_CALL_EFFECT_BONUSES.jackInspect : 0;
      case 12:
        return effects.queenNumberVanish ? ADJACENT_TWO_CALL_EFFECT_BONUSES.queenNumberVanish : 0;
      default:
        return 0;
    }
  }

  switch (card.rank) {
    case 5:
      return effects.fiveSkip
        ? hasEnhancementRight && canEnhancedFiveSkipTargets(context, getTwoCallPlayerIndexes(context))
          ? REMOTE_TWO_CALL_EFFECT_BONUSES.enhancedFiveSkip
          : 0
        : 0;
    case 7:
      return effects.sevenExchange
        ? hasEnhancementRight
          ? REMOTE_TWO_CALL_EFFECT_BONUSES.enhancedSevenExchange
          : REMOTE_TWO_CALL_EFFECT_BONUSES.sevenExchange
        : 0;
    case 8:
      return effects.eightExtraTurn ? REMOTE_TWO_CALL_EFFECT_BONUSES.eightExtraTurn : 0;
    case 9:
      return effects.nineReverse && doesNineReverseIncreaseTwoCallDistance(context)
        ? REMOTE_TWO_CALL_EFFECT_BONUSES.nineReverse
        : 0;
    case 10:
      return effects.tenSwapDraw ? REMOTE_TWO_CALL_EFFECT_BONUSES.tenSwapDraw : 0;
    case 11:
      if (!effects.jackBack) return 0;
      return hasEnhancementRight
        ? REMOTE_TWO_CALL_EFFECT_BONUSES.jackInspect
        : REMOTE_TWO_CALL_EFFECT_BONUSES.jackEnhancementRight;
    case 12:
      return effects.queenNumberVanish ? REMOTE_TWO_CALL_EFFECT_BONUSES.queenNumberVanish : 0;
    default:
      return 0;
  }
}

function getNormalDaifugoEffectBonus(card: Card, context: CpuDecisionContext): number {
  const effects = context.state.daifugoOptions.effects;
  switch (card.rank) {
    case 5:
      return effects.fiveSkip ? NORMAL_DAIFUGO_EFFECT_BONUSES.fiveSkip : 0;
    case 7:
      return effects.sevenExchange ? NORMAL_DAIFUGO_EFFECT_BONUSES.sevenExchange : 0;
    case 8:
      return effects.eightExtraTurn ? NORMAL_DAIFUGO_EFFECT_BONUSES.eightExtraTurn : 0;
    case 9:
      return effects.nineReverse ? NORMAL_DAIFUGO_EFFECT_BONUSES.nineReverse : 0;
    case 10:
      return effects.tenSwapDraw ? NORMAL_DAIFUGO_EFFECT_BONUSES.tenSwapDraw : 0;
    case 11:
      if (!effects.jackBack) return 0;
      return context.currentPlayer.hasJEnhancementRight
        ? NORMAL_DAIFUGO_EFFECT_BONUSES.jackInspect
        : NORMAL_DAIFUGO_EFFECT_BONUSES.jackEnhancementRight;
    case 12:
      return effects.queenNumberVanish ? NORMAL_DAIFUGO_EFFECT_BONUSES.queenNumberVanish : 0;
    default:
      return 0;
  }
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
  chooseReachDeclaration: standardChooseReachDeclaration,
  chooseDaifugoEffectActivation: (context, effect) => {
    if (
      effect === "fiveSkip" &&
      context.state.daifugoOptions.enabled &&
      getReachPlayerIndexes(context).length > 0
    ) {
      return (
        isAdjacentReachThreat(context) ||
        (context.state.players[context.currentPlayerIndex]?.hasJEnhancementRight === true &&
          canEnhancedFiveSkipTargets(context, getReachPlayerIndexes(context)))
      );
    }
    if (
      effect === "fiveSkip" &&
      context.state.daifugoOptions.enabled &&
      getReachPlayerIndexes(context).length === 0 &&
      getTwoCallPlayerIndexes(context).length > 0
    ) {
      return (
        isAdjacentTwoCallThreat(context) ||
        (context.state.players[context.currentPlayerIndex]?.hasJEnhancementRight === true &&
          canEnhancedFiveSkipTargets(context, getTwoCallPlayerIndexes(context)))
      );
    }
    if (
      effect === "nineReverse" &&
      context.state.daifugoOptions.enabled &&
      getReachPlayerIndexes(context).length > 0
    ) {
      return doesNineReverseIncreaseReachDistance(context);
    }
    if (
      effect === "nineReverse" &&
      context.state.daifugoOptions.enabled &&
      getReachPlayerIndexes(context).length === 0 &&
      getTwoCallPlayerIndexes(context).length > 0
    ) {
      return doesNineReverseIncreaseTwoCallDistance(context);
    }
    return chooseStandardDaifugoEffectActivation();
  },
  chooseDaifugoSevenExchangeCard: (context, candidates, role) =>
    chooseDaifugoSevenExchangeCardForModel("tactical", context, candidates, role),
  chooseQueenVanishRank: chooseTacticalQueenRank,
  chooseDaifugoExtraDiscard: (context, _effect, candidates) => chooseStandardDaifugoCard(context, candidates),
  getDiscardDebugInfo: getTacticalDiscardDebugInfo,
  describeDiscardChoice: describeTacticalDiscardChoice,
  describeCallSkip: describeTacticalCallSkip,
};
