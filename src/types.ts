export type Suit = "S" | "H" | "D" | "C";
export type Direction = "clockwise" | "counterclockwise";
export type DrawnFrom = "deck" | "discard";
export type Phase = "setup" | "handoff" | "draw" | "discard" | "reachConfirm" | "ronCheck" | "result";
export type WinType = "tsumo" | "ron" | "deckout";
export type MatchMode = "rounds" | "targetScore" | "startingPoints";
export type CpuModelId = "easy" | "standard" | "tactical" | "master";
export type DaifugoEffectId =
  | "fiveSkip"
  | "sevenExchange"
  | "eightExtraTurn"
  | "nineReverse"
  | "tenSwapDraw"
  | "jackBack"
  | "queenNumberVanish";
export type JackSpecialEffectId = "inspectHands" | "jShield" | "enhanceFiveOrSeven";

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

export type CpuThreatResponseMode = "reach" | "twoCall";

export type PendingDaifugoEffect =
  | {
      kind: "confirm";
      effect: DaifugoEffectId;
      playerIndex: number;
      continue: PendingDaifugoContinue;
      cpuThreatResponseMode?: CpuThreatResponseMode;
      cpuThreatTargetPlayerIndex?: number;
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
      consumeJEnhancementRightOnComplete?: boolean;
      cpuThreatResponseMode?: CpuThreatResponseMode;
    }
  | {
      kind: "sevenEnhancementConfirm";
      effect: "sevenExchange";
      playerIndex: number;
      continue: PendingDaifugoContinue;
    }
  | {
      kind: "sevenEnhancementSplash";
      effect: "sevenExchange";
      playerIndex: number;
      continue: PendingDaifugoContinue;
    }
  | {
      kind: "sevenEnhancedTargetSelect";
      effect: "sevenExchange";
      playerIndex: number;
      selectedTargetPlayerIndex?: number;
      continue: PendingDaifugoContinue;
    }
  | {
      kind: "fiveEnhancementConfirm";
      effect: "fiveSkip";
      playerIndex: number;
      continue: PendingDaifugoContinue;
    }
  | {
      kind: "fiveEnhancementSplash";
      effect: "fiveSkip";
      playerIndex: number;
      continue: PendingDaifugoContinue;
    }
  | {
      kind: "fiveEnhancedTargetSelect";
      effect: "fiveSkip";
      playerIndex: number;
      selectedTargetPlayerIndex?: number;
      continue: PendingDaifugoContinue;
    }
  | {
      kind: "queenSelect";
      effect: "queenNumberVanish";
      playerIndex: number;
      continue: PendingDaifugoContinue;
      cpuThreatResponseMode?: CpuThreatResponseMode;
      cpuThreatTargetPlayerIndex?: number;
    }
  | {
      kind: "queenWinConfirm";
      effect: "queenNumberVanish";
      playerIndex: number;
      winningResult: WinningResult;
      continue: PendingDaifugoContinue;
    }
  | {
      kind: "jackSelect";
      effect: "jackBack";
      playerIndex: number;
      continue: PendingDaifugoContinue;
    }
  | {
      kind: "jackShieldSelect";
      effect: "jackBack";
      playerIndex: number;
      selectableRanks: number[];
      selectableRuns?: Array<{
        key: string;
        label: string;
        ranks: number[];
        cardIds: string[];
      }>;
      continue: PendingDaifugoContinue;
    }
  | {
      kind: "jackInspect";
      effect: "jackBack";
      playerIndex: number;
      targetPlayerIndexes: number[];
      currentTargetOffset: number;
      revealedCardIds: Record<number, string>;
      continue: PendingDaifugoContinue;
    }
  | {
      kind: "reachContinueConfirm";
      effect: "sevenExchange" | "queenNumberVanish";
      playerIndex: number;
      message: string;
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
  hasJEnhancementRight?: boolean;
  jShield?: {
    kind?: "rank" | "run";
    rank?: number;
    ranks?: number[];
    label?: string;
    cardIds: string[];
  };
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

export interface CallCandidateView {
  ownerIndex: number;
  sourceDiscard: Card;
  meld: Card[];
  meldType: "run" | "triple";
}

export interface RonCandidateView {
  discarderIndex: number;
  discardCard: Card;
  winningResult: WinningResult;
}

export interface PlayerReactionView {
  waiting: boolean;
  canCall: boolean;
  callCandidates: CallCandidateView[];
  canRon: boolean;
  ronCandidates: RonCandidateView[];
  canPass: boolean;
  targetDiscard: Card | null;
}

export interface QueenVanishRankOptionView {
  rank: number;
  removedFromDeck: number;
  replenishmentRequired: number;
  availableAfterVanish: number;
  selectable: boolean;
  disabledReason?: string;
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
  cpuThreatResponseMode?: CpuThreatResponseMode;
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

export interface DaifugoDeckDrawEvent {
  id: string;
  playerIndex: number;
  effect: "eightExtraTurn" | "tenSwapDraw";
  drawSource: "deck";
  drawnCard: Card | null;
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
  deckRemaining?: number;
  stateVersion?: number;
  viewerPlayerId?: string;
  availableActions?: string[];
  canTsumo?: boolean;
  canSelfWin?: boolean;
  canReach?: boolean;
  winningDiscardOptions?: WinningDiscardOption[];
  reaction?: PlayerReactionView | null;
  queenVanishRankOptions?: QueenVanishRankOptionView[];
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
  daifugoDeckDrawEvent?: DaifugoDeckDrawEvent | null;
  queenVanishedRanks?: number[];
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
