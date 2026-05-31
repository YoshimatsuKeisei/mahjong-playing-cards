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
}

export interface SimulationViolation {
  game: number;
  seed: number;
  step: number;
  code: string;
  message: string;
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
