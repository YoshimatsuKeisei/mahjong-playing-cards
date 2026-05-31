import type { CpuModelId, DaifugoOptions, Direction, GameResult } from "../types";

export type SimulationLogLevel = "summary" | "detail" | "violations";

export interface SimulationConfig {
  playerModels: CpuModelId[];
  playerLabels: string[];
  games: number;
  rules: "daifugo" | "off";
  seed: number;
  logLevel: SimulationLogLevel;
  direction: Direction;
  maxStepsPerGame: number;
}

export interface SimulationPlayerSummary {
  player: string;
  model: CpuModelId;
  winCount: number;
  totalLoss: number;
  pureLoss: number;
  loserCount: number;
  lossEfficiency: number | null;
  tsumoCount: number;
  ronCount: number;
  callCount: number;
  use5: number;
  use7: number;
  use8: number;
  use9: number;
  use10: number;
  useJ: number;
  useQ: number;
  tacticalNormalDecisionTurns: number;
  tacticalReachDecisionTurns: number;
  tacticalTwoCallDecisionTurns: number;
  proUsed5ToSkipReachTarget: number;
  proUsed5ToSkipTwoCallTarget: number;
  proUsed5ToSkipIrrelevantTarget: number;
  proUsed7OnReachTarget: number;
  proUsed7OnTwoCallTarget: number;
  proUsed7OnIrrelevantTarget: number;
  proUsedQOnReachRelatedRank: number;
  proUsedQOnTwoCallRelatedRank: number;
  proUsedQOnIrrelevantRank: number;
  proUsed9ToIncreaseReachDistance: number;
  proUsed9ToIncreaseTwoCallDistance: number;
  proUsed9WithoutDistanceGain: number;
  proUsedJForEnhancement: number;
  proUsedJForView: number;
  proUsedJBackFallback: number;
}

export interface SimulationViolation {
  game: number;
  seed: number;
  step: number;
  turn?: number;
  code: string;
  message: string;
  cpu?: string;
  effectCard?: string;
  reachPlayers?: string[];
  callCounts?: string[];
  threatTargets?: string[];
  selectedTarget?: string;
  warningReason?: string;
}

export interface SimulationDetailEvent {
  game: number;
  seed: number;
  step: number;
  turn: number;
  player: string;
  model: CpuModelId;
  phase: string;
  hand: string[];
  reachPlayers: string[];
  action: string;
  reason?: string;
}

export interface SimulationSummary {
  config: SimulationConfig;
  daifugoOptions: DaifugoOptions;
  players: SimulationPlayerSummary[];
  completedGames: number;
  deckoutCount: number;
  violations: SimulationViolation[];
  details: SimulationDetailEvent[];
  gameSeeds: number[];
  results: GameResult[];
}
