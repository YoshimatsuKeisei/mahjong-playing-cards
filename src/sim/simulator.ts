import type { Card, CpuModelId, DaifugoOptions, GameResult, GameState } from "../types";
import { createDefaultDaifugoOptions } from "../game/deck";
import { createCpuDecisionContext } from "../game/cpuTypes";
import { createInitialGame, gameReducer, getEnhancedFiveTurnOptions, getNextPlayerIndex, type GameAction } from "../game/gameState";
import { getDisplayedPlayerLosses, getResultLoserIndexes } from "../game/matchState";
import { doesNineReverseIncreaseReachDistance, doesNineReverseIncreaseTwoCallDistance, getTacticalDiscardScores } from "../game/tacticalCpu";
import { chooseHeadlessCpuAction } from "./headlessCpuDriver";
import { deriveGameSeed, withSeededMathRandom } from "./seededRandom";
import type {
  SimulationConfig,
  SimulationDetailEvent,
  SimulationFiveTargetEvent,
  SimulationPlayerSummary,
  SimulationSummary,
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
}

function formatCard(card: Card): string {
  return `${card.rank}${card.suit}`;
}

function describeAction(action: GameAction): string {
  if ("cardId" in action) return `${action.type}(${action.cardId})`;
  if ("discardCardId" in action) return `${action.type}(${action.discardCardId})`;
  if ("rank" in action) return `${action.type}(${action.rank})`;
  if ("activate" in action) return `${action.type}(${action.activate})`;
  if ("declareReach" in action) return `${action.type}(${action.declareReach})`;
  if ("takeRon" in action) return `${action.type}(${action.takeRon})`;
  if ("ownerIndex" in action) return `${action.type}(player-${action.ownerIndex + 1})`;
  return action.type;
}

export function makePlayerSummary(playerIndex: number, config: SimulationConfig): SimulationPlayerSummary {
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
  };
}

function getReachPlayerIndexes(state: GameState, actorIndex: number): number[] {
  return state.players.flatMap((player, index) => (index !== actorIndex && player.isReach ? [index] : []));
}

function getTwoCallPlayerIndexes(state: GameState, actorIndex: number): number[] {
  return state.players.flatMap((player, index) => (index !== actorIndex && player.openMelds.length >= 2 ? [index] : []));
}

function getThreatPlayerIndexes(state: GameState, actorIndex: number): number[] {
  const reachPlayerIndexes = getReachPlayerIndexes(state, actorIndex);
  return reachPlayerIndexes.length > 0 ? reachPlayerIndexes : getTwoCallPlayerIndexes(state, actorIndex);
}

function getPlayerNames(state: GameState, indexes: number[]): string[] {
  return indexes.map((index) => state.players[index]?.name ?? `player-${index + 1}`);
}

function getCallCounts(state: GameState): string[] {
  return state.players.map((player) => `${player.name}=${player.openMelds.length}`);
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
    reachPlayers: getPlayerNames(state, getReachPlayerIndexes(state, actorIndex)),
    callCounts: getCallCounts(state),
    threatTargets: getPlayerNames(state, getThreatPlayerIndexes(state, actorIndex)),
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

function collectTacticalDecisionTurn(state: GameState, action: GameAction, players: SimulationPlayerSummary[]) {
  if (state.phase !== "discard" || (action.type !== "discard" && action.type !== "discardDrawnOnly" && action.type !== "winWithDiscard")) return;
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

function getSelectedPlayerIndexForFive(state: GameState, actorIndex: number, nextState: GameState): number {
  const targetPlayerIndex =
    nextState.lastDiscarderIndex === null
      ? null
      : getNextPlayerIndex(nextState.lastDiscarderIndex, state.players.length, state.direction);
  if (targetPlayerIndex !== null) return targetPlayerIndex;
  const skippedIndex = getNextPlayerIndex(actorIndex, state.players.length, state.direction);
  return getNextPlayerIndex(skippedIndex, state.players.length, state.direction);
}

function getSkippedPlayerIndexesForFive(state: GameState, actorIndex: number, selectedPlayerIndex: number): number[] {
  const option = getEnhancedFiveTurnOptions(state, actorIndex).find((candidate) => candidate.playerIndex === selectedPlayerIndex);
  if (option?.selectable) return option.skippedPlayerIndexes;
  return [getNextPlayerIndex(actorIndex, state.players.length, state.direction)];
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
  const selectedPlayerIndex = getSelectedPlayerIndexForFive(state, actorIndex, nextState);
  const skippedPlayerIndexes = getSkippedPlayerIndexesForFive(state, actorIndex, selectedPlayerIndex);
  const reachPlayerIndexes = getReachPlayerIndexes(state, actorIndex);
  const twoCallPlayerIndexes = getTwoCallPlayerIndexes(state, actorIndex);
  const threatType = reachPlayerIndexes.length > 0 ? "reach" : twoCallPlayerIndexes.length > 0 ? "twoCall" : "none";
  const threatPlayerIndexes = threatType === "reach" ? reachPlayerIndexes : threatType === "twoCall" ? twoCallPlayerIndexes : [];
  const turnOrderIndexes = getTurnOrderIndexes(state, actorIndex);
  const threatTargetIndex = turnOrderIndexes.find((index) => threatPlayerIndexes.includes(index)) ?? null;
  const threatWasSkipped = threatPlayerIndexes.some((index) => skippedPlayerIndexes.includes(index));
  const immediateSkippedPlayerIndex = getNextPlayerIndex(actorIndex, state.players.length, state.direction);
  const threatCouldBeSkipped = state.players[actorIndex]?.hasJEnhancementRight
    ? getEnhancedFiveTurnOptions(state, actorIndex).some(
        (option) => option.selectable && option.skippedPlayerIndexes.some((index) => threatPlayerIndexes.includes(index)),
      )
    : threatPlayerIndexes.includes(immediateSkippedPlayerIndex);
  const event: SimulationFiveTargetEvent = {
    game,
    seed,
    step,
    turn,
    currentPlayer: state.players[actorIndex]?.name ?? `player-${actorIndex + 1}`,
    turnOrder: getPlayerNames(state, turnOrderIndexes),
    selectedPlayer: state.players[selectedPlayerIndex]?.name ?? `player-${selectedPlayerIndex + 1}`,
    nextPlayerBefore5: state.players[getNextPlayerIndex(actorIndex, state.players.length, state.direction)]?.name ?? "-",
    nextPlayerAfter5: state.players[selectedPlayerIndex]?.name ?? `player-${selectedPlayerIndex + 1}`,
    skippedPlayers: getPlayerNames(state, skippedPlayerIndexes),
    reachPlayers: getPlayerNames(state, reachPlayerIndexes),
    twoCallPlayers: getPlayerNames(state, twoCallPlayerIndexes),
    threatType,
    threatTarget: threatTargetIndex === null ? null : state.players[threatTargetIndex]?.name ?? `player-${threatTargetIndex + 1}`,
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
  if (!event || event.kind !== "sevenExchange" || event.actorIndex !== actorIndex || event.id === state.daifugoEffectEvent?.id || event.targetPlayerIndex === undefined) return;
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
  const targetName = state.players[targetPlayerIndex]?.name ?? `player-${targetPlayerIndex + 1}`;
  if (event.cpuThreatResponseMode === "reach" && !reachPlayerIndexes.includes(targetPlayerIndex)) {
    pushTargetWarning(config, violations, game, seed, step, turn, state, actorIndex, "7", "tactical-seven-irrelevant-reach-target", targetName, "7 targeted no reach player.");
  } else if (event.cpuThreatResponseMode === "twoCall" && !twoCallPlayerIndexes.includes(targetPlayerIndex)) {
    pushTargetWarning(config, violations, game, seed, step, turn, state, actorIndex, "7", "tactical-seven-irrelevant-two-call-target", targetName, "7 targeted no two-call player.");
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
  const isRelatedTo = (indexes: number[]) => indexes.some((index) => state.players[index]?.hand.some((card) => card.rank === action.rank));
  if (isRelatedTo(reachPlayerIndexes)) {
    summary.proUsedQOnReachRelatedRank += 1;
  } else if (isRelatedTo(twoCallPlayerIndexes)) {
    summary.proUsedQOnTwoCallRelatedRank += 1;
  } else {
    summary.proUsedQOnIrrelevantRank += 1;
    if (reachPlayerIndexes.length > 0 || twoCallPlayerIndexes.length > 0) {
      pushTargetWarning(config, violations, game, seed, step, turn, state, actorIndex, "Q", "tactical-queen-irrelevant-rank", String(action.rank), "Q removed no rank held by a threat target.");
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
    pushTargetWarning(config, violations, game, seed, step, turn, state, actorIndex, "9", "tactical-nine-without-distance-gain", "-", "9 was activated without increasing threat distance.");
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
) {
  if (!state.players[actorIndex]?.hasJEnhancementRight && nextState.players[actorIndex]?.hasJEnhancementRight) {
    summary.proUsedJForEnhancement += 1;
    return;
  }
  if (state.isJBackActive !== nextState.isJBackActive) {
    summary.proUsedJBackFallback += 1;
    pushTargetWarning(config, violations, game, seed, step, turn, state, actorIndex, "J", "tactical-j-back-fallback", "J-back", "Tactical J unexpectedly resolved to J-back.");
    return;
  }
  summary.proUsedJForView += 1;
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
) {
  collectTacticalDecisionTurn(state, action, players);
  const pending = state.pendingDaifugoEffect;
  if (!pending || pending.kind !== "confirm" || action.type !== "answerDaifugoEffect" || !action.activate) {
    if (pending?.kind === "queenSelect") {
      const actorIndex = pending.playerIndex;
      if (isTacticalFamilyModel(state.players[actorIndex]?.cpuModelId)) {
        collectTacticalQueenTarget(config, game, seed, step, turn, state, action, actorIndex, players[actorIndex], violations);
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
      collectTacticalFiveTarget(config, game, seed, step, turn, state, nextState, actorIndex, summary, violations, fiveTargetEvents);
      return;
    case "sevenExchange":
      collectTacticalSevenTarget(config, game, seed, step, turn, state, nextState, actorIndex, summary, violations);
      return;
    case "nineReverse":
      collectTacticalNineUsage(config, game, seed, step, turn, state, actorIndex, summary, violations);
      return;
    case "jackBack":
      collectTacticalJackUsage(config, game, seed, step, turn, state, nextState, actorIndex, summary, violations);
  }
}

function collectResult(result: GameResult, players: SimulationPlayerSummary[], calledPlayerIndexes: number[]) {
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
    const ronResults = result.ronResults ?? [{ winnerIndex: result.winnerIndex, winningResult: result.winningResult, score: result.score }];
    new Set(ronResults.map((ron) => ron.winnerIndex)).forEach((winnerIndex) => {
      players[winnerIndex].ronCount += 1;
      players[winnerIndex].winCount += 1;
    });
    return;
  }

  players[result.winnerIndex].tsumoCount += 1;
  players[result.winnerIndex].winCount += 1;
}

function createDetailEvent(game: number, seed: number, step: number, turn: number, state: GameState, action: GameAction, reason?: string): SimulationDetailEvent {
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
    reachPlayers: state.players.filter((candidate) => candidate.isReach).map((candidate) => candidate.name),
    action: describeAction(action),
    reason,
  };
}

function createFallbackDeckout(playerCount: number): GameResult {
  return {
    winnerIndex: -1,
    winType: "deckout",
    winningResult: { canWin: false, melds: [], keyCard: null },
    score: { winnerScore: 0, playerLosses: Array.from({ length: playerCount }, () => 0) },
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
    !state.players.some((player, index) => index !== state.currentPlayerIndex && player.isReach)
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
): SimulationGameOutcome {
  return withSeededMathRandom(seed, () => {
    let state = {
      ...createInitialGame(config.playerModels.length, config.direction, 0, "standard", config.rules === "daifugo" ? ALL_DAIFUGO_OPTIONS : createDefaultDaifugoOptions(), config.playerModels, false),
      currentPlayerIndex: startPlayerIndex,
    };
    let turn = 0;
    const calledPlayerIndexes = new Set<number>();
    const complete = (result: GameResult): SimulationGameOutcome => ({
      result,
      calledPlayerIndexes: [...calledPlayerIndexes],
    });

    for (let step = 1; step <= config.maxStepsPerGame; step += 1) {
      if (state.phase === "result" && state.result) return complete(state.result);
      const decision = chooseHeadlessCpuAction(state);
      if (!decision.action) {
        violations.push({ game, seed, step, code: "no-action", message: decision.reason ?? `No action for ${state.phase}.` });
        return complete(createFallbackDeckout(players.length));
      }
      if (state.phase === "draw" && decision.action.type !== "confirmHandoff") {
        turn += 1;
      }
      if (decision.action.type === "takeDiscard" && decision.action.meld) {
        calledPlayerIndexes.add(state.currentPlayerIndex);
      }
      if (config.logLevel === "detail") {
        details.push(createDetailEvent(game, seed, step, turn, state, decision.action, decision.reason));
      }
      collectTacticalReachViolations(game, seed, step, state, decision.action, violations);
      const nextState = gameReducer(state, decision.action);
      collectEffectTelemetry(config, game, seed, step, turn, state, decision.action, nextState, players, violations, fiveTargetEvents);
      if (nextState === state) {
        violations.push({ game, seed, step, code: "stalled-action", message: `${describeAction(decision.action)} did not change state.` });
        return complete(createFallbackDeckout(players.length));
      }
      state = nextState;
    }

    violations.push({ game, seed, step: config.maxStepsPerGame, code: "max-steps", message: `Game exceeded ${config.maxStepsPerGame} steps.` });
    return complete(createFallbackDeckout(players.length));
  });
}

export function runSimulation(config: SimulationConfig): SimulationSummary {
  const players = config.playerModels.map((_, index) => makePlayerSummary(index, config));
  const violations: SimulationViolation[] = [];
  const details: SimulationDetailEvent[] = [];
  const fiveTargetEvents: SimulationFiveTargetEvent[] = [];
  const results: GameResult[] = [];
  const gameSeeds = Array.from({ length: config.games }, (_, index) => deriveGameSeed(config.seed, index));
  const startPlayerIndexes = Array.from({ length: config.games }, (_, index) => index % players.length);
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
      const outcome = runOneGame(config, index + 1, gameSeed, startPlayerIndex, players, violations, details, fiveTargetEvents);
      results.push(outcome.result);
      collectResult(outcome.result, players, outcome.calledPlayerIndexes);
    });
  } finally {
    console.info = originalInfo;
    console.warn = originalWarn;
  }

  players.forEach((player) => {
    player.lossEfficiency = player.loserCount > 0 ? Math.round(player.pureLoss / player.loserCount) : null;
  });

  return {
    config,
    daifugoOptions: config.rules === "daifugo" ? ALL_DAIFUGO_OPTIONS : createDefaultDaifugoOptions(),
    players,
    completedGames: results.length,
    deckoutCount: results.filter((result) => result.winType === "deckout").length,
    violations,
    details,
    fiveTargetEvents,
    gameSeeds,
    startPlayerIndexes,
    results,
  };
}
