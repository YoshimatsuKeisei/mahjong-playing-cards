import type { Card, CpuModelId, DaifugoOptions, GameResult, GameState } from "../types";
import { createDefaultDaifugoOptions } from "../game/deck";
import { createInitialGame, gameReducer, type GameAction } from "../game/gameState";
import { calculatePointDeductions } from "../game/scoring";
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
    totalLoss: 0,
    damageDealt: 0,
    netLoss: 0,
    lossEfficiencyPerGame: 0,
    lossEfficiencyPerTurn: 0,
    turnCount: 0,
    tsumoCount: 0,
    ronCount: 0,
    callCount: 0,
  };
}

function collectResult(result: GameResult, players: SimulationPlayerSummary[]) {
  const deductions = calculatePointDeductions(result, players.length);
  deductions.forEach((loss, index) => {
    players[index].totalLoss += loss;
  });
  if (result.winType === "deckout") return;

  if (result.winType === "ron") {
    const ronResults = result.ronResults ?? [{ winnerIndex: result.winnerIndex, winningResult: result.winningResult, score: result.score }];
    for (const ron of ronResults) {
      players[ron.winnerIndex].ronCount += 1;
      const discarderIndex = result.discarderIndex;
      if (discarderIndex !== null) {
        const winnerLoss = ron.score.playerLosses[ron.winnerIndex] ?? 0;
        const discarderLoss = ron.score.playerLosses[discarderIndex] ?? 0;
        players[ron.winnerIndex].damageDealt += Math.max(0, discarderLoss - winnerLoss);
      }
    }
    return;
  }

  players[result.winnerIndex].tsumoCount += 1;
  players[result.winnerIndex].damageDealt += deductions.reduce((sum, loss) => sum + loss, 0);
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

function runOneGame(config: SimulationConfig, game: number, seed: number, players: SimulationPlayerSummary[], violations: SimulationViolation[], details: SimulationDetailEvent[]): GameResult {
  return withSeededMathRandom(seed, () => {
    let state = createInitialGame(config.playerModels.length, config.direction, 0, "standard", config.rules === "daifugo" ? ALL_DAIFUGO_OPTIONS : createDefaultDaifugoOptions(), config.playerModels, false);
    let turn = 0;

    for (let step = 1; step <= config.maxStepsPerGame; step += 1) {
      if (state.phase === "result" && state.result) return state.result;
      const decision = chooseHeadlessCpuAction(state);
      if (!decision.action) {
        violations.push({ game, seed, step, code: "no-action", message: decision.reason ?? `No action for ${state.phase}.` });
        return createFallbackDeckout(players.length);
      }
      if (state.phase === "draw" && decision.action.type !== "confirmHandoff") {
        turn += 1;
        players[state.currentPlayerIndex].turnCount += 1;
      }
      if (decision.action.type === "takeDiscard" && decision.action.meld) {
        players[state.currentPlayerIndex].callCount += 1;
      }
      if (config.logLevel === "detail") {
        details.push(createDetailEvent(game, seed, step, turn, state, decision.action, decision.reason));
      }
      const nextState = gameReducer(state, decision.action);
      if (nextState === state) {
        violations.push({ game, seed, step, code: "stalled-action", message: `${describeAction(decision.action)} did not change state.` });
        return createFallbackDeckout(players.length);
      }
      state = nextState;
    }

    violations.push({ game, seed, step: config.maxStepsPerGame, code: "max-steps", message: `Game exceeded ${config.maxStepsPerGame} steps.` });
    return createFallbackDeckout(players.length);
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
      const result = runOneGame(config, index + 1, gameSeed, players, violations, details);
      results.push(result);
      collectResult(result, players);
    });
  } finally {
    console.info = originalInfo;
    console.warn = originalWarn;
  }

  players.forEach((player) => {
    player.netLoss = player.totalLoss - player.damageDealt;
    player.lossEfficiencyPerGame = config.games > 0 ? player.totalLoss / config.games : 0;
    player.lossEfficiencyPerTurn = player.turnCount > 0 ? player.totalLoss / player.turnCount : 0;
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
