export type Suit = "S" | "H" | "D" | "C";
export type Direction = "clockwise" | "counterclockwise";
export type DrawnFrom = "deck" | "discard";
export type Phase = "setup" | "handoff" | "draw" | "discard" | "reachConfirm" | "ronCheck" | "result";
export type WinType = "tsumo" | "ron" | "deckout";
export type MatchMode = "rounds" | "targetScore" | "startingPoints";
export type CpuModelId = "easy" | "standard" | "tactical";
export type DaifugoEffectId =
  | "fiveSkip"
  | "sevenExchange"
  | "eightExtraTurn"
  | "nineReverse"
  | "tenSwapDraw"
  | "jackBack"
  | "queenNumberVanish";

export interface DaifugoOptions {
  enabled: boolean;
  effects: {
    fiveSkip: boolean;
    sevenExchange: boolean;
    eightExtraTurn: boolean;
    nineReverse: boolean;
    tenSwapDraw: boolean;
    jackBack: boolean;
    queenNumberVanish: boolean;
  };
}

export interface PendingDaifugoContinue {
  shouldConfirmReach: boolean;
  message?: string;
}

export type PendingDaifugoEffect =
  | {
      kind: "confirm";
      effect: DaifugoEffectId;
      playerIndex: number;
      continue: PendingDaifugoContinue;
    }
  | {
      kind: "extraDiscard";
      effect: "eightExtraTurn" | "tenSwapDraw";
      playerIndex: number;
      continue?: PendingDaifugoContinue;
    }
  | {
      kind: "effectDraw";
      effect: "eightExtraTurn" | "tenSwapDraw";
      playerIndex: number;
      continue: PendingDaifugoContinue;
    }
  | {
      kind: "sevenExchange";
      effect: "sevenExchange";
      playerIndex: number;
      targetPlayerIndex: number;
      selections: Record<number, string>;
      continue: PendingDaifugoContinue;
    }
  | {
      kind: "queenSelect";
      effect: "queenNumberVanish";
      playerIndex: number;
      continue: PendingDaifugoContinue;
    }
  | {
      kind: "queenWinConfirm";
      effect: "queenNumberVanish";
      playerIndex: number;
      winningResult: WinningResult;
      continue: PendingDaifugoContinue;
    };

export interface Card {
  id: string;
  suit: Suit;
  rank: number;
  discardedByEffect?: "queenNumberVanish";
}

export interface Player {
  id: string;
  name: string;
  type: "human" | "cpu";
  isCpu: boolean;
  cpuModelId?: CpuModelId;
  hand: Card[];
  discardPile: Card[];
  openMelds: Card[][];
  hasCalled: boolean;
  isReach: boolean;
  winningResult?: WinningResult;
}

export interface WinningResult {
  canWin: boolean;
  melds: Card[][];
  keyCard: Card | null;
}

export interface WinningDiscardOption {
  discardCard: Card;
  winningResult: WinningResult;
}

export interface ScoreResult {
  winnerScore: number;
  playerLosses: number[];
}

export interface RonResult {
  winnerIndex: number;
  winningResult: WinningResult;
  score: ScoreResult;
}

export interface DaifugoEffectEvent {
  id: string;
  kind: "sevenExchange" | "queenNumberVanish";
  actorIndex: number;
  targetPlayerIndex?: number;
  rank?: number;
  exchangedCards?: Array<{
    playerIndex: number;
    receivedCard: Card;
  }>;
  queenDiscardResults?: Array<{
    playerIndex: number;
    discardedCards: Card[];
    drawnCards: Card[];
  }>;
  queenDeckAudit?: {
    beforeDeckCount: number;
    removedFromDeckCount: number;
    refillDrawCount: number;
    afterDeckCount: number;
    expectedAfterDeckCount: number;
    rank: number;
  };
  reachReleasedPlayerIndexes?: number[];
}

export interface GameResult {
  winnerIndex: number;
  winType: WinType;
  winningResult: WinningResult;
  score: ScoreResult;
  discarderIndex: number | null;
  ronResults?: RonResult[];
}

export interface MatchRoundHistoryEntry {
  round: number;
  result: GameResult;
  playerLosses: number[];
  loserIndexes: number[];
  roundScores: number[];
  pointDeductions: number[];
  cumulativeScoresAfter: number[];
  pointBalancesAfter: number[];
  calledPlayerIndexes: number[];
  reachPlayerIndexes: number[];
}

export interface GameState {
  players: Player[];
  deck: Card[];
  currentPlayerIndex: number;
  direction: Direction;
  daifugoOptions: DaifugoOptions;
  pendingDaifugoEffect: PendingDaifugoEffect | null;
  isJBackActive: boolean;
  phase: Phase;
  drawnCard: Card | null;
  drawnFrom: DrawnFrom | null;
  lastDiscarderIndex: number | null;
  takenDiscardOwnerIndex: number | null;
  winner: number | null;
  result: GameResult | null;
  pendingRonResult: GameResult | null;
  daifugoEffectEvent?: DaifugoEffectEvent | null;
  declaredReachThisTurn: boolean;
  message: string;
  showCpuActions: boolean;
}

export interface MatchState {
  matchMode: MatchMode;
  roomName: string;
  totalRounds: number;
  targetScore: number;
  startingPoints: number;
  currentRound: number;
  playerCount: number;
  humanPlayerCount: number;
  cpuModelId: CpuModelId;
  cpuModelIds: CpuModelId[];
  showCpuActions: boolean;
  direction: Direction;
  daifugoOptions: DaifugoOptions;
  cumulativeScores: number[];
  pointBalances: number[];
  history: MatchRoundHistoryEntry[];
  scoredRound: number | null;
  gameState: GameState;
}

export type AvatarCategory = "bishoujo" | "animal" | "ikemen" | "busho" | "fantasy" | "casual";

export interface AvatarOption {
  id: string;
  category: AvatarCategory;
  name: string;
  face: string;
  hair: string;
  outfit: string;
  accent: string;
  variant: "longHair" | "shortHair" | "ears" | "cool" | "helmet" | "mage" | "archer" | "hoodie" | "cap";
}

export interface ProfileData {
  userName: string;
  comment: string;
  avatarId: string;
}
