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
  startPlayerCount: number;
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
  proUsed5NoThreat: number;
  proUsed5ThreatPresentAndSkippedThreat: number;
  proUsed5ThreatPresentButDidNotSkipThreat: number;
  proUsed5ThreatPresentButCannotSkipThreat: number;
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
  jShieldUsed: number;
  jShieldUsedByHuman: number;
  jShieldUsedByCpu: number;
  jShieldUsedByMaster: number;
  jShieldUsedForSequence: number;
  jShieldUsedForSameRank: number;
  jShieldBlockedQ: number;
  jShieldBlocked7: number;
  jShieldConsumed: number;
  jShieldSequencePartialBrokenByQ: number;
  masterJSelectedEnhance: number;
  masterJSelectedViewHand: number;
  masterJSelectedShield: number;
  masterJShieldUsedInNormalSituation: number;
  masterJShieldSkippedNoCompletedMeld: number;
  masterJShieldSkippedNoShieldableSequence: number;
  masterJShieldSkippedNoShieldableSameRankMeld: number;
  masterJShieldSkippedAlreadySequenceShielded: number;
  masterJShieldSkippedSelfTwoCall: number;
  masterJShieldSkippedSevenAndQEliminated: number;
  masterJShieldSkippedWouldBreakProtectedMeld: number;
  masterJShieldFallbackToViewHand: number;
}

export interface SimulationJShieldSummary {
  jShieldUsedCount: number;
  jShieldUsedByHumanCount: number;
  jShieldUsedByCpuCount: number;
  jShieldUsedByMasterCount: number;
  jShieldUsedForSequenceMeldCount: number;
  jShieldUsedForSameRankMeldCount: number;
  jShieldBlockedQCount: number;
  jShieldBlocked7Count: number;
  jShieldConsumedCount: number;
  jShieldSequencePartialBrokenByQCount: number;
  masterJSelectedEnhanceCount: number;
  masterJSelectedViewHandCount: number;
  masterJSelectedShieldCount: number;
  masterJShieldUsedInNormalSituationCount: number;
  masterJShieldSkippedNoCompletedMeldCount: number;
  masterJShieldSkippedNoShieldableSequenceCount: number;
  masterJShieldSkippedNoShieldableSameRankMeldCount: number;
  masterJShieldSkippedAlreadySequenceShieldedCount: number;
  masterJShieldSkippedSelfTwoCallCount: number;
  masterJShieldSkippedSevenAndQEliminatedCount: number;
  masterJShieldSkippedWouldBreakProtectedMeldCount: number;
  masterJShieldFallbackToViewHandCount: number;
}

export interface SimulationNumberStats {
  count: number;
  avg: number | null;
  p50: number | null;
  p75: number | null;
  p90: number | null;
}

export interface SimulationTurnTimingSummary {
  playerCount: number;
  winnerSelfTurnCountAtWin: SimulationNumberStats;
  selfTurnCountAtReach: SimulationNumberStats;
  selfTurnCountFromReachToWin: SimulationNumberStats;
  reachToTsumoWinSelfTurnCount: SimulationNumberStats;
  reachToRonWinSelfTurnCount: SimulationNumberStats;
  reachDeclaredPlayerCount: number;
  nonReachPlayerCount: number;
  reachRate: number;
  selfTurnCountAtSecondCall: SimulationNumberStats;
  selfTurnCountFromSecondCallToWin: SimulationNumberStats;
  secondCallToTsumoWinSelfTurnCount: SimulationNumberStats;
  secondCallToRonWinSelfTurnCount: SimulationNumberStats;
  secondCallReachedPlayerCount: number;
  nonSecondCallPlayerCount: number;
  secondCallRate: number;
}

export interface SimulationTurnTimingSanityCheck {
  games: number;
  deckouts: number;
  completedGames: number;
  winnerSelfTurnCountAtWinCount: number;
  winnerCountMatchesCompletedGames: boolean;
  minWinnerSelfTurnCountAtWin: number | null;
  maxWinnerSelfTurnCountAtWin: number | null;
  avgGlobalTurnCountAtWin: number | null;
  avgDeckRemainingAtWin: number | null;
  avgDeckConsumedAtWin: number | null;
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
  fiveTarget?: SimulationFiveTargetEvent;
}

export interface SimulationFiveTargetEvent {
  game: number;
  seed: number;
  step: number;
  turn: number;
  currentPlayer: string;
  turnOrder: string[];
  selectedPlayer: string;
  nextPlayerBefore5: string;
  nextPlayerAfter5: string;
  skippedPlayers: string[];
  reachPlayers: string[];
  twoCallPlayers: string[];
  threatType: "reach" | "twoCall" | "none";
  threatTarget: string | null;
  threatWasSkipped: boolean;
  threatCouldBeSkipped: boolean;
}

export interface SimulationJShieldDetailEvent {
  game: number;
  seed: number;
  step: number;
  turn: number;
  player: string;
  event: string;
  decision?: "enhance" | "viewHand" | "jShield";
  reason?: string;
  shieldType?: "sequence" | "sameRank";
  target?: string;
  rank?: string;
  cardIds?: string[];
  remainingShieldedRanks?: string[];
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
  estimatedUnseenByRank?: string;
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
  fiveTargetEvents: SimulationFiveTargetEvent[];
  jShieldDetails: SimulationJShieldDetailEvent[];
  gameSeeds: number[];
  startPlayerIndexes: number[];
  results: GameResult[];
  jShieldSummary: SimulationJShieldSummary;
  turnTiming: SimulationTurnTimingSummary[];
  turnTimingSanity: SimulationTurnTimingSanityCheck;
}
