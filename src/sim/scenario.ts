import type { Card, CpuModelId, DaifugoOptions, Direction, GameState, Player } from "../types";
import { createDefaultDaifugoOptions } from "../game/deck";
import { createCpuDecisionContext } from "../game/cpuTypes";
import { getCpuModel } from "../game/cpuModelRegistry";

export interface CpuScenarioPlayer {
  model?: CpuModelId;
  hand?: Card[];
  discardPile?: Card[];
  openMelds?: Card[][];
  isReach?: boolean;
  hasJEnhancementRight?: boolean;
}

export interface CpuScenarioOptions {
  players: CpuScenarioPlayer[];
  currentPlayerIndex?: number;
  direction?: Direction;
  deck?: Card[];
  daifugoOptions?: DaifugoOptions;
  phase?: GameState["phase"];
  drawnCard?: Card | null;
  drawnFrom?: GameState["drawnFrom"];
  isJBackActive?: boolean;
}

export function createCpuScenario(options: CpuScenarioOptions): GameState {
  const players: Player[] = options.players.map((input, index) => ({
    id: `scenario-player-${index + 1}`,
    name: `scenario-player-${index + 1}`,
    type: "cpu",
    isCpu: true,
    cpuModelId: input.model ?? "standard",
    hand: input.hand ?? [],
    discardPile: input.discardPile ?? [],
    openMelds: input.openMelds ?? [],
    hasCalled: (input.openMelds?.length ?? 0) > 0,
    isReach: input.isReach ?? false,
    hasJEnhancementRight: input.hasJEnhancementRight ?? false,
  }));
  return {
    players,
    deck: options.deck ?? [],
    currentPlayerIndex: options.currentPlayerIndex ?? 0,
    direction: options.direction ?? "clockwise",
    daifugoOptions: options.daifugoOptions ?? createDefaultDaifugoOptions(),
    pendingDaifugoEffect: null,
    isJBackActive: options.isJBackActive ?? false,
    phase: options.phase ?? "draw",
    drawnCard: options.drawnCard ?? null,
    drawnFrom: options.drawnFrom ?? null,
    lastDiscarderIndex: null,
    takenDiscardOwnerIndex: null,
    winner: null,
    result: null,
    pendingRonResult: null,
    queenVanishedRanks: [],
    declaredReachThisTurn: false,
    message: "",
    showCpuActions: false,
  };
}

export function chooseScenarioDiscard(state: GameState): Card | null {
  const context = createCpuDecisionContext(state);
  return context ? getCpuModel(context.currentPlayer.cpuModelId).chooseDiscardCard(context) : null;
}
