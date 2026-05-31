import type { Card, CpuModelId, DaifugoOptions, GameResult, GameState } from "../types";
import { createDefaultDaifugoOptions } from "../game/deck";
import { createCpuDecisionContext } from "../game/cpuTypes";
import { createInitialGame, gameReducer, type GameAction } from "../game/gameState";
import { getDisplayedPlayerLosses, getResultLoserIndexes } from "../game/matchState";
import { doesNineReverseIncreaseReachDistance, getTacticalDiscardScores } from "../game/tacticalCpu";
import { chooseHeadlessCpuAction } from "./headlessCpuDriver";
import { deriveGameSeed, withSeededMathRandom } from "./seededRandom";
import type {
  SimulationConfig,
  SimulationDetailEvent,
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

function makePlayerSummary(playerIndex: number, config: SimulationConfig): SimulationPlayerSummary {
  return {
    player: config.playerLabels[playerIndex],
    model: config.playerModels[playerIndex],
    winCount: 0,
    totalLoss: 0,
    pureLoss: 0,
    loserCount: 0,
    lossEfficiency: null,
    tsumoCount: 0,
    ronCount: 0,
    callCount: 0,
  };
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
    context.currentPlayer.cpuModelId !== "tactical" ||
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

function runOneGame(config: SimulationConfig, game: number, seed: number, players: SimulationPlayerSummary[], violations: SimulationViolation[], details: SimulationDetailEvent[]): SimulationGameOutcome {
  return withSeededMathRandom(seed, () => {
    let state = createInitialGame(config.playerModels.length, config.direction, 0, "standard", config.rules === "daifugo" ? ALL_DAIFUGO_OPTIONS : createDefaultDaifugoOptions(), config.playerModels, false);
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
  const results: GameResult[] = [];
  const gameSeeds = Array.from({ length: config.games }, (_, index) => deriveGameSeed(config.seed, index));
  const originalInfo = console.info;
  const originalWarn = console.warn;

  console.info = () => undefined;
  console.warn = (...args: unknown[]) => {
    if (config.logLevel === "detail") originalWarn(...args);
  };
  try {
    gameSeeds.forEach((gameSeed, index) => {
      const outcome = runOneGame(config, index + 1, gameSeed, players, violations, details);
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
    gameSeeds,
    results,
  };
}
