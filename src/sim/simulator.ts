import type {
  Card,
  CpuModelId,
  DaifugoOptions,
  GameResult,
  GameState,
} from "../types";
import { createDefaultDaifugoOptions } from "../game/deck";
import { createCpuDecisionContext } from "../game/cpuTypes";
import {
  createInitialGame,
  gameReducer,
  getEnhancedFiveTurnOptions,
  getNextPlayerIndex,
  type GameAction,
} from "../game/gameState";
import {
  getDisplayedPlayerLosses,
  getResultLoserIndexes,
} from "../game/matchState";
import { findPossibleMelds, isRun } from "../game/rules";
import {
  doesNineReverseIncreaseReachDistance,
  doesNineReverseIncreaseTwoCallDistance,
  getTacticalDiscardScores,
} from "../game/tacticalCpu";
import {
  createMasterRankEstimate,
  formatEstimatedUnseenByRank,
} from "../game/masterRankEstimate";
import { chooseHeadlessCpuAction } from "./headlessCpuDriver";
import { deriveGameSeed, withSeededMathRandom } from "./seededRandom";
import type {
  SimulationConfig,
  SimulationDetailEvent,
  SimulationFiveTargetEvent,
  SimulationJShieldDetailEvent,
  SimulationJShieldSummary,
  SimulationNumberStats,
  SimulationPlayerSummary,
  SimulationSummary,
  SimulationTurnTimingSanityCheck,
  SimulationTurnTimingSummary,
  SimulationViolation,
} from "./types";

const ALL_DAIFUGO_OPTIONS: DaifugoOptions = {
  enabled: true,
  effects: {
    fiveSkip: true,
    sevenExchange: true,
    eightExtraTurn: true,
    nineReverse: true,
    tenSwapDraw: true,
    jackBack: true,
    queenNumberVanish: true,
  },
};

interface SimulationGameOutcome {
  result: GameResult;
  calledPlayerIndexes: number[];
  timing: SimulationGameTiming;
}

export interface SimulationGameTiming {
  playerCount: number;
  reachSelfTurnCounts: Array<number | null>;
  secondCallSelfTurnCounts: Array<number | null>;
  winners: Array<{
    playerIndex: number;
    winType: "tsumo" | "ron";
    selfTurnCountAtWin: number;
    selfTurnCountFromReachToWin: number | null;
    selfTurnCountFromSecondCallToWin: number | null;
  }>;
  globalTurnCountAtWin: number | null;
  deckRemainingAtWin: number | null;
  deckConsumedAtWin: number | null;
}

function formatCard(card: Card): string {
  return `${card.rank}${card.suit}`;
}

function describeAction(action: GameAction): string {
  if ("cardId" in action) return `${action.type}(${action.cardId})`;
  if ("discardCardId" in action)
    return `${action.type}(${action.discardCardId})`;
  if ("rank" in action) return `${action.type}(${action.rank})`;
  if ("activate" in action) return `${action.type}(${action.activate})`;
  if ("declareReach" in action) return `${action.type}(${action.declareReach})`;
  if ("takeRon" in action) return `${action.type}(${action.takeRon})`;
  if ("ownerIndex" in action)
    return `${action.type}(player-${action.ownerIndex + 1})`;
  return action.type;
}

export function makePlayerSummary(
  playerIndex: number,
  config: SimulationConfig,
): SimulationPlayerSummary {
  return {
    player: config.playerLabels[playerIndex],
    model: config.playerModels[playerIndex],
    startPlayerCount: 0,
    winCount: 0,
    totalLoss: 0,
    pureLoss: 0,
    loserCount: 0,
    lossEfficiency: null,
    tsumoCount: 0,
    ronCount: 0,
    callCount: 0,
    use5: 0,
    use7: 0,
    use8: 0,
    use9: 0,
    use10: 0,
    useJ: 0,
    useQ: 0,
    tacticalNormalDecisionTurns: 0,
    tacticalReachDecisionTurns: 0,
    tacticalTwoCallDecisionTurns: 0,
    proUsed5NoThreat: 0,
    proUsed5ThreatPresentAndSkippedThreat: 0,
    proUsed5ThreatPresentButDidNotSkipThreat: 0,
    proUsed5ThreatPresentButCannotSkipThreat: 0,
    proUsed7OnReachTarget: 0,
    proUsed7OnTwoCallTarget: 0,
    proUsed7OnIrrelevantTarget: 0,
    proUsedQOnReachRelatedRank: 0,
    proUsedQOnTwoCallRelatedRank: 0,
    proUsedQOnIrrelevantRank: 0,
    proUsed9ToIncreaseReachDistance: 0,
    proUsed9ToIncreaseTwoCallDistance: 0,
    proUsed9WithoutDistanceGain: 0,
    proUsedJForEnhancement: 0,
    proUsedJForView: 0,
    proUsedJBackFallback: 0,
    jShieldUsed: 0,
    jShieldUsedByHuman: 0,
    jShieldUsedByCpu: 0,
    jShieldUsedByMaster: 0,
    jShieldUsedForSequence: 0,
    jShieldUsedForSameRank: 0,
    jShieldBlockedQ: 0,
    jShieldBlocked7: 0,
    jShieldConsumed: 0,
    jShieldSequencePartialBrokenByQ: 0,
    masterJSelectedEnhance: 0,
    masterJSelectedViewHand: 0,
    masterJSelectedShield: 0,
    masterJShieldUsedInNormalSituation: 0,
    masterJShieldSkippedNoCompletedMeld: 0,
    masterJShieldSkippedNoShieldableSequence: 0,
    masterJShieldSkippedNoShieldableSameRankMeld: 0,
    masterJShieldSkippedAlreadySequenceShielded: 0,
    masterJShieldSkippedSelfTwoCall: 0,
    masterJShieldSkippedSevenAndQEliminated: 0,
    masterJShieldSkippedWouldBreakProtectedMeld: 0,
    masterJShieldFallbackToViewHand: 0,
  };
}

function getReachPlayerIndexes(state: GameState, actorIndex: number): number[] {
  return state.players.flatMap((player, index) =>
    index !== actorIndex && player.isReach ? [index] : [],
  );
}

function getTwoCallPlayerIndexes(
  state: GameState,
  actorIndex: number,
): number[] {
  return state.players.flatMap((player, index) =>
    index !== actorIndex && player.openMelds.length >= 2 ? [index] : [],
  );
}

function getThreatPlayerIndexes(
  state: GameState,
  actorIndex: number,
): number[] {
  const reachPlayerIndexes = getReachPlayerIndexes(state, actorIndex);
  return reachPlayerIndexes.length > 0
    ? reachPlayerIndexes
    : getTwoCallPlayerIndexes(state, actorIndex);
}

function isNormalJShieldSituation(
  state: GameState,
  actorIndex: number,
): boolean {
  return (
    getReachPlayerIndexes(state, actorIndex).length === 0 &&
    getTwoCallPlayerIndexes(state, actorIndex).length === 0
  );
}

function getPlayerNames(state: GameState, indexes: number[]): string[] {
  return indexes.map(
    (index) => state.players[index]?.name ?? `player-${index + 1}`,
  );
}

function getCallCounts(state: GameState): string[] {
  return state.players.map(
    (player) => `${player.name}=${player.openMelds.length}`,
  );
}

function pushTargetWarning(
  config: SimulationConfig,
  violations: SimulationViolation[],
  game: number,
  seed: number,
  step: number,
  turn: number,
  state: GameState,
  actorIndex: number,
  effectCard: string,
  code: string,
  selectedTarget: string,
  warningReason: string,
  fiveTarget?: SimulationFiveTargetEvent,
) {
  if (config.logLevel !== "violations") return;
  violations.push({
    game,
    seed,
    step,
    turn,
    code,
    cpu: state.players[actorIndex]?.name ?? `player-${actorIndex + 1}`,
    effectCard,
    reachPlayers: getPlayerNames(
      state,
      getReachPlayerIndexes(state, actorIndex),
    ),
    callCounts: getCallCounts(state),
    threatTargets: getPlayerNames(
      state,
      getThreatPlayerIndexes(state, actorIndex),
    ),
    selectedTarget,
    warningReason,
    fiveTarget,
    message: warningReason,
  });
}

function incrementEffectUsage(player: SimulationPlayerSummary, effect: string) {
  switch (effect) {
    case "fiveSkip":
      player.use5 += 1;
      return;
    case "sevenExchange":
      player.use7 += 1;
      return;
    case "eightExtraTurn":
      player.use8 += 1;
      return;
    case "nineReverse":
      player.use9 += 1;
      return;
    case "tenSwapDraw":
      player.use10 += 1;
      return;
    case "jackBack":
      player.useJ += 1;
      return;
    case "queenNumberVanish":
      player.useQ += 1;
  }
}

export function summarizeNumberSamples(
  samples: number[],
): SimulationNumberStats {
  if (samples.length === 0)
    return { count: 0, avg: null, p50: null, p75: null, p90: null };
  const sorted = [...samples].sort((a, b) => a - b);
  const percentile = (ratio: number): number =>
    sorted[
      Math.min(
        sorted.length - 1,
        Math.max(0, Math.ceil(sorted.length * ratio) - 1),
      )
    ] ?? 0;
  return {
    count: sorted.length,
    avg: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    p50: percentile(0.5),
    p75: percentile(0.75),
    p90: percentile(0.9),
  };
}

function createTimingFromResult(
  result: GameResult,
  selfTurnCounts: number[],
  reachSelfTurnCounts: Array<number | null>,
  secondCallSelfTurnCounts: Array<number | null>,
  globalTurnCount: number,
  deckRemaining: number,
  initialDeckCount: number,
): SimulationGameTiming {
  const winners =
    result.winType === "deckout"
      ? []
      : [
          {
            playerIndex: result.winnerIndex,
            winType:
              result.winType === "ron" ? ("ron" as const) : ("tsumo" as const),
          },
        ];

  return {
    playerCount: selfTurnCounts.length,
    reachSelfTurnCounts: [...reachSelfTurnCounts],
    secondCallSelfTurnCounts: [...secondCallSelfTurnCounts],
    winners: winners.map((winner) => {
      const winSelfTurnCount = selfTurnCounts[winner.playerIndex] ?? 0;
      const reachSelfTurnCount = reachSelfTurnCounts[winner.playerIndex];
      const secondCallSelfTurnCount =
        secondCallSelfTurnCounts[winner.playerIndex];
      return {
        playerIndex: winner.playerIndex,
        winType: winner.winType,
        selfTurnCountAtWin: winSelfTurnCount,
        selfTurnCountFromReachToWin:
          reachSelfTurnCount === null
            ? null
            : Math.max(0, winSelfTurnCount - reachSelfTurnCount),
        selfTurnCountFromSecondCallToWin:
          secondCallSelfTurnCount === null
            ? null
            : Math.max(0, winSelfTurnCount - secondCallSelfTurnCount),
      };
    }),
    globalTurnCountAtWin: result.winType === "deckout" ? null : globalTurnCount,
    deckRemainingAtWin: result.winType === "deckout" ? null : deckRemaining,
    deckConsumedAtWin:
      result.winType === "deckout"
        ? null
        : Math.max(0, initialDeckCount - deckRemaining),
  };
}

export function createTurnTimingSummary(
  timings: SimulationGameTiming[],
): SimulationTurnTimingSummary[] {
  const byPlayerCount = new Map<number, SimulationGameTiming[]>();
  for (const timing of timings) {
    byPlayerCount.set(timing.playerCount, [
      ...(byPlayerCount.get(timing.playerCount) ?? []),
      timing,
    ]);
  }

  return [...byPlayerCount.entries()]
    .sort(([a], [b]) => a - b)
    .map(([playerCount, games]) => {
      const playerSlots = games.length * playerCount;
      const reachSamples = games.flatMap((game) =>
        game.reachSelfTurnCounts.filter(
          (value): value is number => value !== null,
        ),
      );
      const secondCallSamples = games.flatMap((game) =>
        game.secondCallSelfTurnCounts.filter(
          (value): value is number => value !== null,
        ),
      );
      const winners = games.flatMap((game) => game.winners);
      const reachWinSamples = winners.flatMap((winner) =>
        winner.selfTurnCountFromReachToWin === null
          ? []
          : [winner.selfTurnCountFromReachToWin],
      );
      const secondCallWinSamples = winners.flatMap((winner) =>
        winner.selfTurnCountFromSecondCallToWin === null
          ? []
          : [winner.selfTurnCountFromSecondCallToWin],
      );
      return {
        playerCount,
        winnerSelfTurnCountAtWin: summarizeNumberSamples(
          winners.map((winner) => winner.selfTurnCountAtWin),
        ),
        selfTurnCountAtReach: summarizeNumberSamples(reachSamples),
        selfTurnCountFromReachToWin: summarizeNumberSamples(reachWinSamples),
        reachToTsumoWinSelfTurnCount: summarizeNumberSamples(
          winners.flatMap((winner) =>
            winner.winType === "tsumo" &&
            winner.selfTurnCountFromReachToWin !== null
              ? [winner.selfTurnCountFromReachToWin]
              : [],
          ),
        ),
        reachToRonWinSelfTurnCount: summarizeNumberSamples(
          winners.flatMap((winner) =>
            winner.winType === "ron" &&
            winner.selfTurnCountFromReachToWin !== null
              ? [winner.selfTurnCountFromReachToWin]
              : [],
          ),
        ),
        reachDeclaredPlayerCount: reachSamples.length,
        nonReachPlayerCount: playerSlots - reachSamples.length,
        reachRate: playerSlots > 0 ? reachSamples.length / playerSlots : 0,
        selfTurnCountAtSecondCall: summarizeNumberSamples(secondCallSamples),
        selfTurnCountFromSecondCallToWin:
          summarizeNumberSamples(secondCallWinSamples),
        secondCallToTsumoWinSelfTurnCount: summarizeNumberSamples(
          winners.flatMap((winner) =>
            winner.winType === "tsumo" &&
            winner.selfTurnCountFromSecondCallToWin !== null
              ? [winner.selfTurnCountFromSecondCallToWin]
              : [],
          ),
        ),
        secondCallToRonWinSelfTurnCount: summarizeNumberSamples(
          winners.flatMap((winner) =>
            winner.winType === "ron" &&
            winner.selfTurnCountFromSecondCallToWin !== null
              ? [winner.selfTurnCountFromSecondCallToWin]
              : [],
          ),
        ),
        secondCallReachedPlayerCount: secondCallSamples.length,
        nonSecondCallPlayerCount: playerSlots - secondCallSamples.length,
        secondCallRate:
          playerSlots > 0 ? secondCallSamples.length / playerSlots : 0,
      };
    });
}

export function createTurnTimingSanityCheck(
  games: number,
  deckouts: number,
  timings: SimulationGameTiming[],
): SimulationTurnTimingSanityCheck {
  const completedGames = games - deckouts;
  const winnerSamples = timings.flatMap((timing) =>
    timing.winners.map((winner) => winner.selfTurnCountAtWin),
  );
  const globalTurnSamples = timings.flatMap((timing) =>
    timing.globalTurnCountAtWin === null ? [] : [timing.globalTurnCountAtWin],
  );
  const deckRemainingSamples = timings.flatMap((timing) =>
    timing.deckRemainingAtWin === null ? [] : [timing.deckRemainingAtWin],
  );
  const deckConsumedSamples = timings.flatMap((timing) =>
    timing.deckConsumedAtWin === null ? [] : [timing.deckConsumedAtWin],
  );
  const avg = (samples: number[]): number | null =>
    samples.length === 0
      ? null
      : samples.reduce((sum, value) => sum + value, 0) / samples.length;
  return {
    games,
    deckouts,
    completedGames,
    winnerSelfTurnCountAtWinCount: winnerSamples.length,
    winnerCountMatchesCompletedGames: winnerSamples.length === completedGames,
    minWinnerSelfTurnCountAtWin:
      winnerSamples.length === 0 ? null : Math.min(...winnerSamples),
    maxWinnerSelfTurnCountAtWin:
      winnerSamples.length === 0 ? null : Math.max(...winnerSamples),
    avgGlobalTurnCountAtWin: avg(globalTurnSamples),
    avgDeckRemainingAtWin: avg(deckRemainingSamples),
    avgDeckConsumedAtWin: avg(deckConsumedSamples),
  };
}

function collectTacticalDecisionTurn(
  state: GameState,
  action: GameAction,
  players: SimulationPlayerSummary[],
) {
  if (
    state.phase !== "discard" ||
    (action.type !== "discard" &&
      action.type !== "discardDrawnOnly" &&
      action.type !== "winWithDiscard")
  )
    return;
  const actorIndex = state.currentPlayerIndex;
  if (!isTacticalFamilyModel(state.players[actorIndex]?.cpuModelId)) return;
  const summary = players[actorIndex];
  if (getReachPlayerIndexes(state, actorIndex).length > 0) {
    summary.tacticalReachDecisionTurns += 1;
  } else if (getTwoCallPlayerIndexes(state, actorIndex).length > 0) {
    summary.tacticalTwoCallDecisionTurns += 1;
  } else {
    summary.tacticalNormalDecisionTurns += 1;
  }
}

function getTurnOrderIndexes(state: GameState, actorIndex: number): number[] {
  const indexes = [actorIndex];
  let cursor = actorIndex;
  for (let count = 1; count < state.players.length; count += 1) {
    cursor = getNextPlayerIndex(cursor, state.players.length, state.direction);
    indexes.push(cursor);
  }
  return indexes;
}

function getSelectedPlayerIndexForFive(
  state: GameState,
  actorIndex: number,
  nextState: GameState,
): number {
  const targetPlayerIndex =
    nextState.lastDiscarderIndex === null
      ? null
      : getNextPlayerIndex(
          nextState.lastDiscarderIndex,
          state.players.length,
          state.direction,
        );
  if (targetPlayerIndex !== null) return targetPlayerIndex;
  const skippedIndex = getNextPlayerIndex(
    actorIndex,
    state.players.length,
    state.direction,
  );
  return getNextPlayerIndex(
    skippedIndex,
    state.players.length,
    state.direction,
  );
}

function getSkippedPlayerIndexesForFive(
  state: GameState,
  actorIndex: number,
  selectedPlayerIndex: number,
): number[] {
  const option = getEnhancedFiveTurnOptions(state, actorIndex).find(
    (candidate) => candidate.playerIndex === selectedPlayerIndex,
  );
  if (option?.selectable) return option.skippedPlayerIndexes;
  return [
    getNextPlayerIndex(actorIndex, state.players.length, state.direction),
  ];
}

function collectTacticalFiveTarget(
  config: SimulationConfig,
  game: number,
  seed: number,
  step: number,
  turn: number,
  state: GameState,
  nextState: GameState,
  actorIndex: number,
  summary: SimulationPlayerSummary,
  violations: SimulationViolation[],
  fiveTargetEvents: SimulationFiveTargetEvent[],
) {
  const selectedPlayerIndex = getSelectedPlayerIndexForFive(
    state,
    actorIndex,
    nextState,
  );
  const skippedPlayerIndexes = getSkippedPlayerIndexesForFive(
    state,
    actorIndex,
    selectedPlayerIndex,
  );
  const reachPlayerIndexes = getReachPlayerIndexes(state, actorIndex);
  const twoCallPlayerIndexes = getTwoCallPlayerIndexes(state, actorIndex);
  const threatType =
    reachPlayerIndexes.length > 0
      ? "reach"
      : twoCallPlayerIndexes.length > 0
        ? "twoCall"
        : "none";
  const threatPlayerIndexes =
    threatType === "reach"
      ? reachPlayerIndexes
      : threatType === "twoCall"
        ? twoCallPlayerIndexes
        : [];
  const turnOrderIndexes = getTurnOrderIndexes(state, actorIndex);
  const threatTargetIndex =
    turnOrderIndexes.find((index) => threatPlayerIndexes.includes(index)) ??
    null;
  const threatWasSkipped = threatPlayerIndexes.some((index) =>
    skippedPlayerIndexes.includes(index),
  );
  const immediateSkippedPlayerIndex = getNextPlayerIndex(
    actorIndex,
    state.players.length,
    state.direction,
  );
  const threatCouldBeSkipped = state.players[actorIndex]?.hasJEnhancementRight
    ? getEnhancedFiveTurnOptions(state, actorIndex).some(
        (option) =>
          option.selectable &&
          option.skippedPlayerIndexes.some((index) =>
            threatPlayerIndexes.includes(index),
          ),
      )
    : threatPlayerIndexes.includes(immediateSkippedPlayerIndex);
  const event: SimulationFiveTargetEvent = {
    game,
    seed,
    step,
    turn,
    currentPlayer:
      state.players[actorIndex]?.name ?? `player-${actorIndex + 1}`,
    turnOrder: getPlayerNames(state, turnOrderIndexes),
    selectedPlayer:
      state.players[selectedPlayerIndex]?.name ??
      `player-${selectedPlayerIndex + 1}`,
    nextPlayerBefore5:
      state.players[
        getNextPlayerIndex(actorIndex, state.players.length, state.direction)
      ]?.name ?? "-",
    nextPlayerAfter5:
      state.players[selectedPlayerIndex]?.name ??
      `player-${selectedPlayerIndex + 1}`,
    skippedPlayers: getPlayerNames(state, skippedPlayerIndexes),
    reachPlayers: getPlayerNames(state, reachPlayerIndexes),
    twoCallPlayers: getPlayerNames(state, twoCallPlayerIndexes),
    threatType,
    threatTarget:
      threatTargetIndex === null
        ? null
        : (state.players[threatTargetIndex]?.name ??
          `player-${threatTargetIndex + 1}`),
    threatWasSkipped,
    threatCouldBeSkipped,
  };
  fiveTargetEvents.push(event);

  if (threatType === "none") {
    summary.proUsed5NoThreat += 1;
  } else if (threatWasSkipped) {
    summary.proUsed5ThreatPresentAndSkippedThreat += 1;
  } else if (!threatCouldBeSkipped) {
    summary.proUsed5ThreatPresentButCannotSkipThreat += 1;
  } else {
    summary.proUsed5ThreatPresentButDidNotSkipThreat += 1;
    pushTargetWarning(
      config,
      violations,
      game,
      seed,
      step,
      turn,
      state,
      actorIndex,
      "5",
      "tactical-five-did-not-skip-threat",
      event.selectedPlayer,
      "5 could skip a threat target but did not.",
      event,
    );
  }
}

function collectTacticalSevenTarget(
  config: SimulationConfig,
  game: number,
  seed: number,
  step: number,
  turn: number,
  state: GameState,
  nextState: GameState,
  actorIndex: number,
  summary: SimulationPlayerSummary,
  violations: SimulationViolation[],
) {
  const event = nextState.daifugoEffectEvent;
  if (
    !event ||
    event.kind !== "sevenExchange" ||
    event.actorIndex !== actorIndex ||
    event.id === state.daifugoEffectEvent?.id ||
    event.targetPlayerIndex === undefined
  )
    return;
  const reachPlayerIndexes = getReachPlayerIndexes(state, actorIndex);
  const twoCallPlayerIndexes = getTwoCallPlayerIndexes(state, actorIndex);
  const targetPlayerIndex = event.targetPlayerIndex;
  if (reachPlayerIndexes.includes(targetPlayerIndex)) {
    summary.proUsed7OnReachTarget += 1;
  } else if (twoCallPlayerIndexes.includes(targetPlayerIndex)) {
    summary.proUsed7OnTwoCallTarget += 1;
  } else {
    summary.proUsed7OnIrrelevantTarget += 1;
  }
  const targetName =
    state.players[targetPlayerIndex]?.name ?? `player-${targetPlayerIndex + 1}`;
  if (
    event.cpuThreatResponseMode === "reach" &&
    !reachPlayerIndexes.includes(targetPlayerIndex)
  ) {
    pushTargetWarning(
      config,
      violations,
      game,
      seed,
      step,
      turn,
      state,
      actorIndex,
      "7",
      "tactical-seven-irrelevant-reach-target",
      targetName,
      "7 targeted no reach player.",
    );
  } else if (
    event.cpuThreatResponseMode === "twoCall" &&
    !twoCallPlayerIndexes.includes(targetPlayerIndex)
  ) {
    pushTargetWarning(
      config,
      violations,
      game,
      seed,
      step,
      turn,
      state,
      actorIndex,
      "7",
      "tactical-seven-irrelevant-two-call-target",
      targetName,
      "7 targeted no two-call player.",
    );
  }
}

function collectTacticalQueenTarget(
  config: SimulationConfig,
  game: number,
  seed: number,
  step: number,
  turn: number,
  state: GameState,
  action: GameAction,
  actorIndex: number,
  summary: SimulationPlayerSummary,
  violations: SimulationViolation[],
) {
  if (action.type !== "selectQueenVanishRank") return;
  const reachPlayerIndexes = getReachPlayerIndexes(state, actorIndex);
  const twoCallPlayerIndexes = getTwoCallPlayerIndexes(state, actorIndex);
  const isRelatedTo = (indexes: number[]) =>
    indexes.some((index) =>
      state.players[index]?.hand.some((card) => card.rank === action.rank),
    );
  if (isRelatedTo(reachPlayerIndexes)) {
    summary.proUsedQOnReachRelatedRank += 1;
  } else if (isRelatedTo(twoCallPlayerIndexes)) {
    summary.proUsedQOnTwoCallRelatedRank += 1;
  } else {
    summary.proUsedQOnIrrelevantRank += 1;
    if (reachPlayerIndexes.length > 0 || twoCallPlayerIndexes.length > 0) {
      pushTargetWarning(
        config,
        violations,
        game,
        seed,
        step,
        turn,
        state,
        actorIndex,
        "Q",
        "tactical-queen-irrelevant-rank",
        String(action.rank),
        "Q removed no rank held by a threat target.",
      );
    }
  }
}

function collectTacticalNineUsage(
  config: SimulationConfig,
  game: number,
  seed: number,
  step: number,
  turn: number,
  state: GameState,
  actorIndex: number,
  summary: SimulationPlayerSummary,
  violations: SimulationViolation[],
) {
  const context = createCpuDecisionContext(state);
  if (!context) return;
  if (doesNineReverseIncreaseReachDistance(context)) {
    summary.proUsed9ToIncreaseReachDistance += 1;
    return;
  }
  if (doesNineReverseIncreaseTwoCallDistance(context)) {
    summary.proUsed9ToIncreaseTwoCallDistance += 1;
    return;
  }
  summary.proUsed9WithoutDistanceGain += 1;
  if (getThreatPlayerIndexes(state, actorIndex).length > 0) {
    pushTargetWarning(
      config,
      violations,
      game,
      seed,
      step,
      turn,
      state,
      actorIndex,
      "9",
      "tactical-nine-without-distance-gain",
      "-",
      "9 was activated without increasing threat distance.",
    );
  }
}

type MasterJShieldSkipReason =
  | "masterJShieldSkippedNoCompletedMeld"
  | "masterJShieldSkippedNoShieldableSequence"
  | "masterJShieldSkippedNoShieldableSameRankMeld"
  | "masterJShieldSkippedAlreadySequenceShielded"
  | "masterJShieldSkippedSelfTwoCall"
  | "masterJShieldSkippedSevenAndQEliminated"
  | "masterJShieldSkippedWouldBreakProtectedMeld";

function formatRank(rank: number): string {
  if (rank === 1) return "A";
  if (rank === 11) return "J";
  if (rank === 12) return "Q";
  if (rank === 13) return "K";
  return String(rank);
}

function getShieldType(
  shield: GameState["players"][number]["jShield"] | undefined,
): "sequence" | "sameRank" | undefined {
  if (!shield) return undefined;
  return shield.kind === "run" ? "sequence" : "sameRank";
}

function formatShieldTarget(
  shield: GameState["players"][number]["jShield"] | undefined,
): string | undefined {
  if (!shield) return undefined;
  if (shield.kind === "run")
    return shield.label ?? shield.ranks?.map(formatRank).join("");
  return shield.rank === undefined ? undefined : formatRank(shield.rank);
}

function didPlayerGainJShield(
  state: GameState,
  nextState: GameState,
  playerIndex: number,
): boolean {
  const before = state.players[playerIndex]?.jShield;
  const after = nextState.players[playerIndex]?.jShield;
  if (!after) return false;
  if (!before) return true;
  return (
    before.cardIds.join("|") !== after.cardIds.join("|") ||
    before.kind !== after.kind ||
    before.rank !== after.rank ||
    before.label !== after.label
  );
}

function getJShieldCardIds(
  player: GameState["players"][number] | undefined,
): Set<string> {
  return new Set(player?.jShield?.cardIds ?? []);
}

function getJShieldConsumedCardIds(
  beforePlayer: GameState["players"][number] | undefined,
  afterPlayer: GameState["players"][number] | undefined,
): string[] {
  const beforeIds = getJShieldCardIds(beforePlayer);
  const afterIds = getJShieldCardIds(afterPlayer);
  return [...beforeIds].filter((cardId) => !afterIds.has(cardId));
}

function pushJShieldDetail(
  config: SimulationConfig,
  details: SimulationJShieldDetailEvent[],
  game: number,
  seed: number,
  step: number,
  turn: number,
  state: GameState,
  playerIndex: number,
  detail: Omit<
    SimulationJShieldDetailEvent,
    "game" | "seed" | "step" | "turn" | "player"
  >,
) {
  if (config.logLevel !== "detail") return;
  details.push({
    game,
    seed,
    step,
    turn,
    player: state.players[playerIndex]?.name ?? `player-${playerIndex + 1}`,
    ...detail,
  });
}

function hasShieldableSequence(player: GameState["players"][number]): boolean {
  return findPossibleMelds(player.hand).some(isRun);
}

function hasShieldableSameRankMeld(
  player: GameState["players"][number],
): boolean {
  const counts = new Map<number, number>();
  for (const card of player.hand)
    counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  return [...counts.entries()].some(
    ([rank, count]) => count >= 3 && (rank !== 11 || count >= 4),
  );
}

function wouldBreakJRun(player: GameState["players"][number]): boolean {
  const jCount = player.hand.filter((card) => card.rank === 11).length;
  return (
    jCount <= 1 &&
    findPossibleMelds(player.hand).some(
      (meld) => isRun(meld) && meld.some((card) => card.rank === 11),
    )
  );
}

function classifyMasterJShieldSkipReason(
  state: GameState,
  actorIndex: number,
): MasterJShieldSkipReason {
  const player = state.players[actorIndex];
  if (!player) return "masterJShieldSkippedNoCompletedMeld";
  if (player.openMelds.length >= 2) return "masterJShieldSkippedSelfTwoCall";
  if (player.jShield?.kind === "run")
    return "masterJShieldSkippedAlreadySequenceShielded";
  const vanishedRanks = new Set(state.queenVanishedRanks ?? []);
  if (vanishedRanks.has(7) && vanishedRanks.has(12))
    return "masterJShieldSkippedSevenAndQEliminated";
  const melds = findPossibleMelds(player.hand);
  if (melds.length === 0) return "masterJShieldSkippedNoCompletedMeld";
  const hasSequence = hasShieldableSequence(player);
  const hasSameRank = hasShieldableSameRankMeld(player);
  if (!hasSequence && wouldBreakJRun(player))
    return "masterJShieldSkippedWouldBreakProtectedMeld";
  if (!hasSequence) return "masterJShieldSkippedNoShieldableSequence";
  if (!hasSameRank) return "masterJShieldSkippedNoShieldableSameRankMeld";
  return "masterJShieldSkippedWouldBreakProtectedMeld";
}

function incrementMasterJShieldSkip(
  summary: SimulationPlayerSummary,
  reason: MasterJShieldSkipReason,
) {
  switch (reason) {
    case "masterJShieldSkippedNoCompletedMeld":
      summary.masterJShieldSkippedNoCompletedMeld += 1;
      return;
    case "masterJShieldSkippedNoShieldableSequence":
      summary.masterJShieldSkippedNoShieldableSequence += 1;
      return;
    case "masterJShieldSkippedNoShieldableSameRankMeld":
      summary.masterJShieldSkippedNoShieldableSameRankMeld += 1;
      return;
    case "masterJShieldSkippedAlreadySequenceShielded":
      summary.masterJShieldSkippedAlreadySequenceShielded += 1;
      return;
    case "masterJShieldSkippedSelfTwoCall":
      summary.masterJShieldSkippedSelfTwoCall += 1;
      return;
    case "masterJShieldSkippedSevenAndQEliminated":
      summary.masterJShieldSkippedSevenAndQEliminated += 1;
      return;
    case "masterJShieldSkippedWouldBreakProtectedMeld":
      summary.masterJShieldSkippedWouldBreakProtectedMeld += 1;
  }
}

function collectTacticalJackUsage(
  config: SimulationConfig,
  game: number,
  seed: number,
  step: number,
  turn: number,
  state: GameState,
  nextState: GameState,
  actorIndex: number,
  summary: SimulationPlayerSummary,
  violations: SimulationViolation[],
  jShieldDetails: SimulationJShieldDetailEvent[],
) {
  const isMaster = state.players[actorIndex]?.cpuModelId === "master";
  if (
    !state.players[actorIndex]?.hasJEnhancementRight &&
    nextState.players[actorIndex]?.hasJEnhancementRight
  ) {
    summary.proUsedJForEnhancement += 1;
    if (isMaster) {
      summary.masterJSelectedEnhance += 1;
      pushJShieldDetail(
        config,
        jShieldDetails,
        game,
        seed,
        step,
        turn,
        state,
        actorIndex,
        {
          event: "masterJDecision",
          decision: "enhance",
          reason: "selectedEnhancement",
        },
      );
    }
    return;
  }
  if (didPlayerGainJShield(state, nextState, actorIndex)) {
    if (isMaster) {
      summary.masterJSelectedShield += 1;
      if (isNormalJShieldSituation(state, actorIndex)) {
        summary.masterJShieldUsedInNormalSituation += 1;
      }
      const shield = nextState.players[actorIndex]?.jShield;
      pushJShieldDetail(
        config,
        jShieldDetails,
        game,
        seed,
        step,
        turn,
        nextState,
        actorIndex,
        {
          event: "masterJDecision",
          decision: "jShield",
          shieldType: getShieldType(shield),
          target: formatShieldTarget(shield),
          reason:
            getShieldType(shield) === "sequence"
              ? "sequenceShieldSelected"
              : "sameRankShieldSelected",
        },
      );
    }
    return;
  }
  if (state.isJBackActive !== nextState.isJBackActive) {
    summary.proUsedJBackFallback += 1;
    pushTargetWarning(
      config,
      violations,
      game,
      seed,
      step,
      turn,
      state,
      actorIndex,
      "J",
      "tactical-j-back-fallback",
      "J-back",
      "Tactical J unexpectedly resolved to J-back.",
    );
    return;
  }
  summary.proUsedJForView += 1;
  if (isMaster) {
    const reason = classifyMasterJShieldSkipReason(state, actorIndex);
    incrementMasterJShieldSkip(summary, reason);
    summary.masterJSelectedViewHand += 1;
    summary.masterJShieldFallbackToViewHand += 1;
    pushJShieldDetail(
      config,
      jShieldDetails,
      game,
      seed,
      step,
      turn,
      state,
      actorIndex,
      {
        event: "masterJDecision",
        decision: "viewHand",
        reason,
      },
    );
  }
}

function collectJShieldUsage(
  config: SimulationConfig,
  game: number,
  seed: number,
  step: number,
  turn: number,
  state: GameState,
  action: GameAction,
  nextState: GameState,
  players: SimulationPlayerSummary[],
  jShieldDetails: SimulationJShieldDetailEvent[],
) {
  const isShieldAction =
    action.type === "selectJackShieldRank" ||
    action.type === "selectJackShieldRun" ||
    (action.type === "answerDaifugoEffect" &&
      state.pendingDaifugoEffect?.kind === "confirm" &&
      state.pendingDaifugoEffect.effect === "jackBack");
  if (!isShieldAction) return;
  state.players.forEach((beforePlayer, playerIndex) => {
    const afterPlayer = nextState.players[playerIndex];
    if (!afterPlayer || !didPlayerGainJShield(state, nextState, playerIndex))
      return;
    const shield = afterPlayer.jShield;
    if (!shield) return;
    const summary = players[playerIndex];
    summary.jShieldUsed += 1;
    if (afterPlayer.isCpu) {
      summary.jShieldUsedByCpu += 1;
    } else {
      summary.jShieldUsedByHuman += 1;
    }
    if (afterPlayer.cpuModelId === "master") {
      summary.jShieldUsedByMaster += 1;
    }
    if (getShieldType(shield) === "sequence") {
      summary.jShieldUsedForSequence += 1;
    } else {
      summary.jShieldUsedForSameRank += 1;
    }
    pushJShieldDetail(
      config,
      jShieldDetails,
      game,
      seed,
      step,
      turn,
      nextState,
      playerIndex,
      {
        event: "J Shield used",
        shieldType: getShieldType(shield),
        target: formatShieldTarget(shield),
        cardIds: shield.cardIds,
      },
    );
  });
}

function collectJShieldDefense(
  config: SimulationConfig,
  game: number,
  seed: number,
  step: number,
  turn: number,
  state: GameState,
  action: GameAction,
  nextState: GameState,
  players: SimulationPlayerSummary[],
  jShieldDetails: SimulationJShieldDetailEvent[],
) {
  state.players.forEach((beforePlayer, playerIndex) => {
    const consumedCardIds = getJShieldConsumedCardIds(
      beforePlayer,
      nextState.players[playerIndex],
    );
    if (consumedCardIds.length === 0) return;
    const summary = players[playerIndex];
    summary.jShieldConsumed += 1;
    const beforeType = getShieldType(beforePlayer.jShield);
    if (action.type === "selectQueenVanishRank") {
      summary.jShieldBlockedQ += 1;
      const afterShield = nextState.players[playerIndex]?.jShield;
      if (beforeType === "sequence" && afterShield) {
        summary.jShieldSequencePartialBrokenByQ += 1;
      }
      pushJShieldDetail(
        config,
        jShieldDetails,
        game,
        seed,
        step,
        turn,
        nextState,
        playerIndex,
        {
          event: "J Shield blocked Q",
          rank: formatRank(action.rank),
          shieldType: beforeType,
          remainingShieldedRanks: nextState.players[
            playerIndex
          ]?.jShield?.cardIds.map((cardId) => {
            const card = nextState.players[playerIndex]?.hand.find(
              (candidate) => candidate.id === cardId,
            );
            return card ? formatRank(card.rank) : cardId;
          }),
        },
      );
      return;
    }
    if (
      state.pendingDaifugoEffect?.kind === "sevenExchange" &&
      nextState.daifugoEffectEvent?.kind === "sevenExchange"
    ) {
      summary.jShieldBlocked7 += 1;
      pushJShieldDetail(
        config,
        jShieldDetails,
        game,
        seed,
        step,
        turn,
        nextState,
        playerIndex,
        {
          event: "J Shield blocked 7",
          shieldType: beforeType,
          target: formatShieldTarget(beforePlayer.jShield),
          cardIds: consumedCardIds,
        },
      );
    }
  });
}

export function collectEffectTelemetry(
  config: SimulationConfig,
  game: number,
  seed: number,
  step: number,
  turn: number,
  state: GameState,
  action: GameAction,
  nextState: GameState,
  players: SimulationPlayerSummary[],
  violations: SimulationViolation[],
  fiveTargetEvents: SimulationFiveTargetEvent[] = [],
  jShieldDetails: SimulationJShieldDetailEvent[] = [],
) {
  collectTacticalDecisionTurn(state, action, players);
  collectJShieldUsage(
    config,
    game,
    seed,
    step,
    turn,
    state,
    action,
    nextState,
    players,
    jShieldDetails,
  );
  collectJShieldDefense(
    config,
    game,
    seed,
    step,
    turn,
    state,
    action,
    nextState,
    players,
    jShieldDetails,
  );
  const pending = state.pendingDaifugoEffect;
  if (
    !pending ||
    pending.kind !== "confirm" ||
    action.type !== "answerDaifugoEffect" ||
    !action.activate
  ) {
    if (pending?.kind === "queenSelect") {
      const actorIndex = pending.playerIndex;
      if (isTacticalFamilyModel(state.players[actorIndex]?.cpuModelId)) {
        collectTacticalQueenTarget(
          config,
          game,
          seed,
          step,
          turn,
          state,
          action,
          actorIndex,
          players[actorIndex],
          violations,
        );
      }
    }
    return;
  }

  const actorIndex = pending.playerIndex;
  const summary = players[actorIndex];
  incrementEffectUsage(summary, pending.effect);
  if (!isTacticalFamilyModel(state.players[actorIndex]?.cpuModelId)) return;

  switch (pending.effect) {
    case "fiveSkip":
      collectTacticalFiveTarget(
        config,
        game,
        seed,
        step,
        turn,
        state,
        nextState,
        actorIndex,
        summary,
        violations,
        fiveTargetEvents,
      );
      return;
    case "sevenExchange":
      collectTacticalSevenTarget(
        config,
        game,
        seed,
        step,
        turn,
        state,
        nextState,
        actorIndex,
        summary,
        violations,
      );
      return;
    case "nineReverse":
      collectTacticalNineUsage(
        config,
        game,
        seed,
        step,
        turn,
        state,
        actorIndex,
        summary,
        violations,
      );
      return;
    case "jackBack":
      collectTacticalJackUsage(
        config,
        game,
        seed,
        step,
        turn,
        state,
        nextState,
        actorIndex,
        summary,
        violations,
        jShieldDetails,
      );
  }
}

function collectResult(
  result: GameResult,
  players: SimulationPlayerSummary[],
  calledPlayerIndexes: number[],
) {
  const playerLosses = getDisplayedPlayerLosses(result, players.length);
  playerLosses.forEach((loss, index) => {
    players[index].totalLoss += loss;
  });
  getResultLoserIndexes(result, players.length).forEach((index) => {
    players[index].pureLoss += playerLosses[index] ?? 0;
    players[index].loserCount += 1;
  });
  calledPlayerIndexes.forEach((index) => {
    players[index].callCount += 1;
  });
  if (result.winType === "deckout") return;

  if (result.winType === "ron") {
    const ronResults = result.ronResults ?? [
      {
        winnerIndex: result.winnerIndex,
        winningResult: result.winningResult,
        score: result.score,
      },
    ];
    new Set(ronResults.map((ron) => ron.winnerIndex)).forEach((winnerIndex) => {
      players[winnerIndex].ronCount += 1;
      players[winnerIndex].winCount += 1;
    });
    return;
  }

  players[result.winnerIndex].tsumoCount += 1;
  players[result.winnerIndex].winCount += 1;
}

function sumPlayers(
  players: SimulationPlayerSummary[],
  selector: (player: SimulationPlayerSummary) => number,
): number {
  return players.reduce((total, player) => total + selector(player), 0);
}

function createJShieldSummary(
  players: SimulationPlayerSummary[],
): SimulationJShieldSummary {
  return {
    jShieldUsedCount: sumPlayers(players, (player) => player.jShieldUsed),
    jShieldUsedByHumanCount: sumPlayers(
      players,
      (player) => player.jShieldUsedByHuman,
    ),
    jShieldUsedByCpuCount: sumPlayers(
      players,
      (player) => player.jShieldUsedByCpu,
    ),
    jShieldUsedByMasterCount: sumPlayers(
      players,
      (player) => player.jShieldUsedByMaster,
    ),
    jShieldUsedForSequenceMeldCount: sumPlayers(
      players,
      (player) => player.jShieldUsedForSequence,
    ),
    jShieldUsedForSameRankMeldCount: sumPlayers(
      players,
      (player) => player.jShieldUsedForSameRank,
    ),
    jShieldBlockedQCount: sumPlayers(
      players,
      (player) => player.jShieldBlockedQ,
    ),
    jShieldBlocked7Count: sumPlayers(
      players,
      (player) => player.jShieldBlocked7,
    ),
    jShieldConsumedCount: sumPlayers(
      players,
      (player) => player.jShieldConsumed,
    ),
    jShieldSequencePartialBrokenByQCount: sumPlayers(
      players,
      (player) => player.jShieldSequencePartialBrokenByQ,
    ),
    masterJSelectedEnhanceCount: sumPlayers(
      players,
      (player) => player.masterJSelectedEnhance,
    ),
    masterJSelectedViewHandCount: sumPlayers(
      players,
      (player) => player.masterJSelectedViewHand,
    ),
    masterJSelectedShieldCount: sumPlayers(
      players,
      (player) => player.masterJSelectedShield,
    ),
    masterJShieldUsedInNormalSituationCount: sumPlayers(
      players,
      (player) => player.masterJShieldUsedInNormalSituation,
    ),
    masterJShieldSkippedNoCompletedMeldCount: sumPlayers(
      players,
      (player) => player.masterJShieldSkippedNoCompletedMeld,
    ),
    masterJShieldSkippedNoShieldableSequenceCount: sumPlayers(
      players,
      (player) => player.masterJShieldSkippedNoShieldableSequence,
    ),
    masterJShieldSkippedNoShieldableSameRankMeldCount: sumPlayers(
      players,
      (player) => player.masterJShieldSkippedNoShieldableSameRankMeld,
    ),
    masterJShieldSkippedAlreadySequenceShieldedCount: sumPlayers(
      players,
      (player) => player.masterJShieldSkippedAlreadySequenceShielded,
    ),
    masterJShieldSkippedSelfTwoCallCount: sumPlayers(
      players,
      (player) => player.masterJShieldSkippedSelfTwoCall,
    ),
    masterJShieldSkippedSevenAndQEliminatedCount: sumPlayers(
      players,
      (player) => player.masterJShieldSkippedSevenAndQEliminated,
    ),
    masterJShieldSkippedWouldBreakProtectedMeldCount: sumPlayers(
      players,
      (player) => player.masterJShieldSkippedWouldBreakProtectedMeld,
    ),
    masterJShieldFallbackToViewHandCount: sumPlayers(
      players,
      (player) => player.masterJShieldFallbackToViewHand,
    ),
  };
}

function createDetailEvent(
  game: number,
  seed: number,
  step: number,
  turn: number,
  state: GameState,
  action: GameAction,
  reason?: string,
): SimulationDetailEvent {
  const player = state.players[state.currentPlayerIndex];
  return {
    game,
    seed,
    step,
    turn,
    player: player?.name ?? `player-${state.currentPlayerIndex + 1}`,
    model: player?.cpuModelId ?? "standard",
    phase: state.phase,
    hand: player?.hand.map(formatCard) ?? [],
    reachPlayers: state.players
      .filter((candidate) => candidate.isReach)
      .map((candidate) => candidate.name),
    estimatedUnseenByRank:
      player?.cpuModelId === "master"
        ? formatEstimatedUnseenByRank(
            createMasterRankEstimate(state, state.currentPlayerIndex),
          )
        : undefined,
    action: describeAction(action),
    reason,
  };
}

function createFallbackDeckout(playerCount: number): GameResult {
  return {
    winnerIndex: -1,
    winType: "deckout",
    winningResult: { canWin: false, melds: [], keyCard: null },
    score: {
      winnerScore: 0,
      playerLosses: Array.from({ length: playerCount }, () => 0),
    },
    discarderIndex: null,
  };
}

function collectTacticalReachViolations(
  game: number,
  seed: number,
  step: number,
  state: GameState,
  action: GameAction,
  violations: SimulationViolation[],
) {
  const context = createCpuDecisionContext(state);
  if (
    !context ||
    !isTacticalFamilyModel(context.currentPlayer.cpuModelId) ||
    !state.daifugoOptions.enabled ||
    !state.players.some(
      (player, index) => index !== state.currentPlayerIndex && player.isReach,
    )
  ) {
    return;
  }

  if (state.phase === "discard" && action.type === "discard") {
    const expectedCard = getTacticalDiscardScores(context)[0]?.card;
    if (expectedCard && expectedCard.id !== action.cardId) {
      violations.push({
        game,
        seed,
        step,
        code: "tactical-reach-discard-priority",
        message: `Expected ${formatCard(expectedCard)} but discarded ${action.cardId}.`,
      });
    }
  }

  if (
    state.pendingDaifugoEffect?.kind === "confirm" &&
    state.pendingDaifugoEffect.effect === "nineReverse" &&
    action.type === "answerDaifugoEffect"
  ) {
    const expectedActivation = doesNineReverseIncreaseReachDistance(context);
    if (action.activate !== expectedActivation) {
      violations.push({
        game,
        seed,
        step,
        code: "tactical-reach-nine-distance",
        message: `Expected 9 activation=${expectedActivation} but received ${action.activate}.`,
      });
    }
  }
}

function isTacticalFamilyModel(cpuModelId: CpuModelId | undefined): boolean {
  return cpuModelId === "tactical" || cpuModelId === "master";
}

function runOneGame(
  config: SimulationConfig,
  game: number,
  seed: number,
  startPlayerIndex: number,
  players: SimulationPlayerSummary[],
  violations: SimulationViolation[],
  details: SimulationDetailEvent[],
  fiveTargetEvents: SimulationFiveTargetEvent[],
  jShieldDetails: SimulationJShieldDetailEvent[],
): SimulationGameOutcome {
  return withSeededMathRandom(seed, () => {
    let state = {
      ...createInitialGame(
        config.playerModels.length,
        config.direction,
        0,
        "standard",
        config.rules === "daifugo"
          ? ALL_DAIFUGO_OPTIONS
          : createDefaultDaifugoOptions(),
        config.playerModels,
        false,
      ),
      currentPlayerIndex: startPlayerIndex,
    };
    const initialDeckCount = state.deck.length;
    let turn = 0;
    const selfTurnCounts = Array.from({ length: players.length }, () => 0);
    const reachSelfTurnCounts: Array<number | null> = Array.from(
      { length: players.length },
      () => null,
    );
    const secondCallSelfTurnCounts: Array<number | null> = Array.from(
      { length: players.length },
      () => null,
    );
    const calledPlayerIndexes = new Set<number>();
    const complete = (result: GameResult): SimulationGameOutcome => ({
      result,
      calledPlayerIndexes: [...calledPlayerIndexes],
      timing: createTimingFromResult(
        result,
        selfTurnCounts,
        reachSelfTurnCounts,
        secondCallSelfTurnCounts,
        turn,
        state.deck.length,
        initialDeckCount,
      ),
    });

    for (let step = 1; step <= config.maxStepsPerGame; step += 1) {
      if (state.phase === "result" && state.result)
        return complete(state.result);
      const decision = chooseHeadlessCpuAction(state);
      if (!decision.action) {
        violations.push({
          game,
          seed,
          step,
          code: "no-action",
          message: decision.reason ?? `No action for ${state.phase}.`,
        });
        return complete(createFallbackDeckout(players.length));
      }
      if (state.phase === "draw" && decision.action.type !== "confirmHandoff") {
        turn += 1;
        selfTurnCounts[state.currentPlayerIndex] += 1;
      }
      if (decision.action.type === "takeDiscard" && decision.action.meld) {
        calledPlayerIndexes.add(state.currentPlayerIndex);
      }
      if (config.logLevel === "detail") {
        details.push(
          createDetailEvent(
            game,
            seed,
            step,
            turn,
            state,
            decision.action,
            decision.reason,
          ),
        );
      }
      collectTacticalReachViolations(
        game,
        seed,
        step,
        state,
        decision.action,
        violations,
      );
      const nextState = gameReducer(state, decision.action);
      if (
        (decision.action.type === "answerReachAfterDiscard" &&
          decision.action.declareReach) ||
        decision.action.type === "declareReach"
      ) {
        reachSelfTurnCounts[state.currentPlayerIndex] ??=
          selfTurnCounts[state.currentPlayerIndex];
      }
      if (decision.action.type === "takeDiscard" && decision.action.meld) {
        const beforeCallCount =
          state.players[state.currentPlayerIndex]?.openMelds.length ?? 0;
        const afterCallCount =
          nextState.players[state.currentPlayerIndex]?.openMelds.length ??
          beforeCallCount;
        if (beforeCallCount < 2 && afterCallCount >= 2) {
          secondCallSelfTurnCounts[state.currentPlayerIndex] ??=
            selfTurnCounts[state.currentPlayerIndex];
        }
      }
      collectEffectTelemetry(
        config,
        game,
        seed,
        step,
        turn,
        state,
        decision.action,
        nextState,
        players,
        violations,
        fiveTargetEvents,
        jShieldDetails,
      );
      if (nextState === state) {
        violations.push({
          game,
          seed,
          step,
          code: "stalled-action",
          message: `${describeAction(decision.action)} did not change state.`,
        });
        return complete(createFallbackDeckout(players.length));
      }
      state = nextState;
    }

    violations.push({
      game,
      seed,
      step: config.maxStepsPerGame,
      code: "max-steps",
      message: `Game exceeded ${config.maxStepsPerGame} steps.`,
    });
    return complete(createFallbackDeckout(players.length));
  });
}

export function runSimulation(config: SimulationConfig): SimulationSummary {
  const players = config.playerModels.map((_, index) =>
    makePlayerSummary(index, config),
  );
  const violations: SimulationViolation[] = [];
  const details: SimulationDetailEvent[] = [];
  const fiveTargetEvents: SimulationFiveTargetEvent[] = [];
  const jShieldDetails: SimulationJShieldDetailEvent[] = [];
  const results: GameResult[] = [];
  const timings: SimulationGameTiming[] = [];
  const gameSeeds = Array.from({ length: config.games }, (_, index) =>
    deriveGameSeed(config.seed, index),
  );
  const startPlayerIndexes = Array.from(
    { length: config.games },
    (_, index) => index % players.length,
  );
  const originalInfo = console.info;
  const originalWarn = console.warn;

  console.info = () => undefined;
  console.warn = (...args: unknown[]) => {
    if (config.logLevel === "detail") originalWarn(...args);
  };
  try {
    gameSeeds.forEach((gameSeed, index) => {
      const startPlayerIndex = startPlayerIndexes[index];
      players[startPlayerIndex].startPlayerCount += 1;
      const outcome = runOneGame(
        config,
        index + 1,
        gameSeed,
        startPlayerIndex,
        players,
        violations,
        details,
        fiveTargetEvents,
        jShieldDetails,
      );
      results.push(outcome.result);
      timings.push(outcome.timing);
      collectResult(outcome.result, players, outcome.calledPlayerIndexes);
    });
  } finally {
    console.info = originalInfo;
    console.warn = originalWarn;
  }

  players.forEach((player) => {
    player.lossEfficiency =
      player.loserCount > 0
        ? Math.round(player.pureLoss / player.loserCount)
        : null;
  });

  const deckoutCount = results.filter(
    (result) => result.winType === "deckout",
  ).length;
  return {
    config,
    daifugoOptions:
      config.rules === "daifugo"
        ? ALL_DAIFUGO_OPTIONS
        : createDefaultDaifugoOptions(),
    players,
    completedGames: results.length,
    deckoutCount,
    violations,
    details,
    fiveTargetEvents,
    jShieldDetails,
    gameSeeds,
    startPlayerIndexes,
    results,
    jShieldSummary: createJShieldSummary(players),
    turnTiming: createTurnTimingSummary(timings),
    turnTimingSanity: createTurnTimingSanityCheck(
      results.length,
      deckoutCount,
      timings,
    ),
  };
}
