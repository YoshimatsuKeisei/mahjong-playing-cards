import type { Card, CpuModelId, DaifugoEffectId, DaifugoOptions, Direction, GameResult, GameState, PendingDaifugoContinue, Player, RonResult } from "../types";
import { createDeck, createDefaultDaifugoOptions, dealCards, shuffleDeck, sortCards } from "./deck";
import {
  canDeclareReachAfterDraw,
  checkWinningHandWithOpenMelds,
  findCallMeldOptions,
  findWinningDiscardsAfterDraw,
} from "./rules";
import { calculateCardLoss, calculateRonScore, calculateTsumoScore } from "./scoring";

export function getNextPlayerIndex(currentIndex: number, playerCount: number, direction: Direction): number {
  return direction === "clockwise"
    ? (currentIndex + 1) % playerCount
    : (currentIndex - 1 + playerCount) % playerCount;
}

export function createInitialGame(
  playerCount: number,
  direction: Direction,
  humanPlayerCount = playerCount,
  cpuModelId: CpuModelId = "standard",
  daifugoOptions: DaifugoOptions = createDefaultDaifugoOptions(),
): GameState {
  return dealCards(shuffleDeck(createDeck()), playerCount, direction, humanPlayerCount, cpuModelId, daifugoOptions);
}

function replacePlayer(players: Player[], index: number, nextPlayer: Player): Player[] {
  return players.map((player, playerIndex) => (playerIndex === index ? nextPlayer : player));
}

function topDiscard(player: Player): Card | null {
  return player.discardPile[player.discardPile.length - 1] ?? null;
}

function formatCpuCard(card: Card): string {
  return `${card.rank}${card.suit}`;
}

function makeResult(
  state: GameState,
  winnerIndex: number,
  winType: GameResult["winType"],
  winningResult = state.players[winnerIndex].winningResult!,
  discarderIndex: number | null = null,
): GameResult {
  const score =
    winType === "ron" && discarderIndex !== null
      ? calculateRonScore(state.players, winnerIndex, discarderIndex, winningResult, state.isJBackActive)
      : calculateTsumoScore(state.players, winnerIndex, winningResult, state.isJBackActive);

  return {
    winnerIndex,
    winType,
    winningResult,
    score,
    discarderIndex,
    ronResults:
      winType === "ron"
        ? [
            {
              winnerIndex,
              winningResult,
              score,
            },
          ]
        : undefined,
  };
}

function findReachRonResults(
  players: Player[],
  discarderIndex: number,
  discardCard: Card,
  isJBackActive: boolean,
): Array<RonResult & { player: Player }> {
  const results: Array<RonResult & { player: Player }> = [];

  players.forEach((player, winnerIndex) => {
    if (winnerIndex === discarderIndex || !player.isReach) return;
    const options = findWinningDiscardsAfterDraw([...player.hand, discardCard], discardCard.id, player.openMelds);
    const option = options[0];
    if (!option) return;

    results.push({
      winnerIndex,
      winningResult: option.winningResult,
      score: calculateRonScore(players, winnerIndex, discarderIndex, option.winningResult, isJBackActive),
      player: { ...player, winningResult: option.winningResult },
    });
  });

  return results;
}

function makeReachRonResult(state: GameState, discarderIndex: number): { result: GameResult; players: Player[] } | null {
  const discardCard = topDiscard(state.players[discarderIndex]);
  if (!discardCard) return null;

  const ronCandidates = findReachRonResults(state.players, discarderIndex, discardCard, state.isJBackActive);
  if (ronCandidates.length === 0) return null;

  const players = ronCandidates.reduce(
    (nextPlayers, candidate) => replacePlayer(nextPlayers, candidate.winnerIndex, candidate.player),
    state.players,
  );
  const ronResults = ronCandidates.map(({ winnerIndex, winningResult, score }) => ({
    winnerIndex,
    winningResult,
    score,
  }));
  const first = ronResults[0];

  return {
    players,
    result: {
      winnerIndex: first.winnerIndex,
      winType: "ron",
      winningResult: first.winningResult,
      score: first.score,
      discarderIndex,
      ronResults,
    },
  };
}

function deckoutResult(state: GameState, players: Player[]): GameState {
  const losses = players.map((candidate) => {
    const fallback = checkWinningHandWithOpenMelds(candidate.hand, candidate.openMelds);
    return fallback.keyCard
      ? calculateCardLoss(fallback.keyCard, state.isJBackActive)
      : Math.min(...candidate.hand.map((card) => calculateCardLoss(card, state.isJBackActive)));
  });
  const winnerIndex = losses.indexOf(Math.min(...losses));
  const deckoutWinningResult = checkWinningHandWithOpenMelds(players[winnerIndex].hand, players[winnerIndex].openMelds);
  const withWinnerResult = replacePlayer(players, winnerIndex, {
    ...players[winnerIndex],
    winningResult: deckoutWinningResult.canWin
      ? deckoutWinningResult
      : { canWin: false, melds: [], keyCard: players[winnerIndex].hand[0] ?? null },
  });
  const deckoutState = { ...state, players: withWinnerResult };
  const result = makeResult(deckoutState, winnerIndex, "deckout", deckoutState.players[winnerIndex].winningResult);
  return { ...deckoutState, phase: "result", winner: winnerIndex, result, pendingRonResult: null, declaredReachThisTurn: false };
}

function advanceToNextDraw(state: GameState, players: Player[], discarderIndex: number, message?: string): GameState {
  const ron = makeReachRonResult({ ...state, players }, discarderIndex);
  if (ron) {
    return {
      ...state,
      players: ron.players,
      phase: "ronCheck",
      pendingRonResult: ron.result,
      declaredReachThisTurn: false,
      message: "ロン確認中です。",
    };
  }

  return {
    ...state,
    players,
    phase: "handoff",
    drawnCard: null,
    drawnFrom: null,
    lastDiscarderIndex: discarderIndex,
    takenDiscardOwnerIndex: null,
    declaredReachThisTurn: false,
    message: message ?? "次のプレイヤーへ交代してください。",
  };
}

function continueAfterDaifugo(state: GameState, continueState: PendingDaifugoContinue, players = state.players): GameState {
  if (continueState.shouldConfirmReach) {
    return {
      ...state,
      players,
      pendingDaifugoEffect: null,
      phase: "reachConfirm",
      drawnCard: null,
      drawnFrom: null,
      lastDiscarderIndex: state.currentPlayerIndex,
      takenDiscardOwnerIndex: null,
      declaredReachThisTurn: false,
      message: "リーチを宣言しますか？",
    };
  }

  return advanceToNextDraw({ ...state, pendingDaifugoEffect: null, players }, players, state.currentPlayerIndex, continueState.message);
}

function reverseDirection(direction: Direction): Direction {
  return direction === "clockwise" ? "counterclockwise" : "clockwise";
}

function getDaifugoEffectForCard(card: Card, options: DaifugoOptions): DaifugoEffectId | null {
  if (!options.enabled) return null;
  if (card.rank === 5 && options.effects.fiveSkip) return "fiveSkip";
  if (card.rank === 8 && options.effects.eightExtraTurn) return "eightExtraTurn";
  if (card.rank === 9 && options.effects.nineReverse) return "nineReverse";
  if (card.rank === 10 && options.effects.tenSwapDraw) return "tenSwapDraw";
  if (card.rank === 11 && options.effects.jackBack) return "jackBack";
  return null;
}

function createPendingDaifugoEffect(state: GameState, discardCard: Card, continueState: PendingDaifugoContinue) {
  const effect = getDaifugoEffectForCard(discardCard, state.daifugoOptions);
  if (!effect) return null;
  return {
    kind: "confirm" as const,
    effect,
    playerIndex: state.currentPlayerIndex,
    continue: continueState,
  };
}

function getDaifugoConfirmMessage(effect: DaifugoEffectId): string {
  switch (effect) {
    case "fiveSkip":
      return "5の効果：次のプレイヤーをスキップしますか？";
    case "eightExtraTurn":
      return "8の効果：追加ターンを行い、Jバックを解除しますか？";
    case "nineReverse":
      return "9の効果：手番方向を逆にしますか？";
    case "tenSwapDraw":
      return "10の効果：追加で1枚捨てて山札から1枚引きますか？";
    case "jackBack":
      return "Jの効果：Jバックを発動/解除しますか？";
    default:
      return "カード効果を発動しますか？";
  }
}

function drawOneForPlayer(state: GameState, playerIndex: number): { state: GameState; drawnCard: Card | null } {
  if (state.deck.length === 0) return { state, drawnCard: null };
  const [drawnCard, ...deck] = state.deck;
  const player = state.players[playerIndex];
  const players = replacePlayer(state.players, playerIndex, { ...player, hand: sortCards([...player.hand, drawnCard]) });
  return { state: { ...state, deck, players, drawnCard, drawnFrom: "deck" }, drawnCard };
}

function applyDaifugoEffect(state: GameState): GameState {
  const pending = state.pendingDaifugoEffect;
  if (!pending || pending.kind !== "confirm" || pending.playerIndex !== state.currentPlayerIndex) return state;

  if (pending.effect === "fiveSkip") {
    const skippedIndex = getNextPlayerIndex(state.currentPlayerIndex, state.players.length, state.direction);
    return advanceToNextDraw({ ...state, pendingDaifugoEffect: null }, state.players, skippedIndex, "5の効果で次のプレイヤーをスキップしました。");
  }

  if (pending.effect === "nineReverse") {
    return continueAfterDaifugo({ ...state, direction: reverseDirection(state.direction) }, pending.continue);
  }

  if (pending.effect === "jackBack") {
    return continueAfterDaifugo({ ...state, isJBackActive: !state.isJBackActive }, pending.continue);
  }

  if (pending.effect === "eightExtraTurn") {
    const drawn = drawOneForPlayer({ ...state, pendingDaifugoEffect: null, isJBackActive: false }, state.currentPlayerIndex);
    if (!drawn.drawnCard) return continueAfterDaifugo(drawn.state, pending.continue);
    return {
      ...drawn.state,
      phase: "discard",
      pendingDaifugoEffect: {
        kind: "extraDiscard",
        effect: "eightExtraTurn",
        playerIndex: state.currentPlayerIndex,
        continue: pending.continue,
      },
      message: "8の効果：追加行動で1枚捨ててください。",
    };
  }

  if (pending.effect === "tenSwapDraw") {
    return {
      ...state,
      pendingDaifugoEffect: {
        kind: "extraDiscard",
        effect: "tenSwapDraw",
        playerIndex: state.currentPlayerIndex,
        continue: pending.continue,
      },
      phase: "discard",
      message: "10の効果：追加で捨てるカードを1枚選んでください。",
    };
  }

  return state;
}

export type GameAction =
  | { type: "start"; playerCount: number; direction: Direction; humanPlayerCount?: number; cpuModelId?: CpuModelId; daifugoOptions?: DaifugoOptions }
  | { type: "confirmHandoff" }
  | { type: "answerRon"; takeRon: boolean }
  | { type: "answerDaifugoEffect"; activate: boolean }
  | { type: "discardForDaifugoEffect"; cardId: string }
  | { type: "drawFromDeck" }
  | { type: "takeDiscard"; ownerIndex: number; meld?: Card[] }
  | { type: "declareReach" }
  | { type: "answerReachAfterDiscard"; declareReach: boolean }
  | { type: "discard"; cardId: string }
  | { type: "discardDrawnOnly" }
  | { type: "winWithDiscard"; discardCardId: string }
  | { type: "restart" };

export function gameReducer(state: GameState, action: GameAction): GameState {
  if (
    state.pendingDaifugoEffect &&
    action.type !== "answerDaifugoEffect" &&
    action.type !== "discardForDaifugoEffect" &&
    action.type !== "restart"
  ) {
    return state;
  }

  switch (action.type) {
    case "start":
      return createInitialGame(
        action.playerCount,
        action.direction,
        action.humanPlayerCount ?? action.playerCount,
        action.cpuModelId ?? "standard",
        action.daifugoOptions ?? createDefaultDaifugoOptions(),
      );

    case "restart":
      return {
        players: [],
        deck: [],
        currentPlayerIndex: 0,
        direction: "clockwise",
        daifugoOptions: createDefaultDaifugoOptions(),
        pendingDaifugoEffect: null,
        isJBackActive: false,
        phase: "setup",
        drawnCard: null,
        drawnFrom: null,
        lastDiscarderIndex: null,
        takenDiscardOwnerIndex: null,
        winner: null,
        result: null,
        pendingRonResult: null,
        declaredReachThisTurn: false,
        message: "",
      };

    case "confirmHandoff": {
      const nextPlayerIndex =
        state.lastDiscarderIndex === null
          ? state.currentPlayerIndex
          : getNextPlayerIndex(state.lastDiscarderIndex, state.players.length, state.direction);
      return {
        ...state,
        currentPlayerIndex: nextPlayerIndex,
        phase: "draw",
        pendingRonResult: null,
        message: "カードを1枚取ってください。",
      };
    }

    case "answerRon":
      if (state.phase !== "ronCheck" || !state.pendingRonResult) return state;
      if (!action.takeRon) {
        return {
          ...state,
          phase: "handoff",
          currentPlayerIndex: state.pendingRonResult.discarderIndex ?? state.currentPlayerIndex,
          lastDiscarderIndex: state.pendingRonResult.discarderIndex,
          pendingRonResult: null,
          drawnCard: null,
          drawnFrom: null,
          takenDiscardOwnerIndex: null,
          declaredReachThisTurn: false,
          message: "次のプレイヤーへ交代してください。",
        };
      }
      return {
        ...state,
        phase: "result",
        winner: state.pendingRonResult.winnerIndex,
        result: state.pendingRonResult,
        pendingRonResult: null,
        declaredReachThisTurn: false,
      };

    case "answerDaifugoEffect": {
      const pending = state.pendingDaifugoEffect;
      if (!pending || pending.kind !== "confirm") return state;
      if (!action.activate) {
        return continueAfterDaifugo({ ...state, pendingDaifugoEffect: null }, pending.continue);
      }
      return applyDaifugoEffect(state);
    }

    case "discardForDaifugoEffect": {
      const pending = state.pendingDaifugoEffect;
      if (!pending || pending.kind !== "extraDiscard" || pending.playerIndex !== state.currentPlayerIndex) return state;
      const player = state.players[state.currentPlayerIndex];
      const discardCard = player.hand.find((card) => card.id === action.cardId);
      if (!discardCard) return state;

      const nextPlayer: Player = {
        ...player,
        hand: sortCards(player.hand.filter((card) => card.id !== discardCard.id)),
        discardPile: [...player.discardPile, discardCard],
      };
      let nextState: GameState = {
        ...state,
        players: replacePlayer(state.players, state.currentPlayerIndex, nextPlayer),
        pendingDaifugoEffect: null,
        drawnCard: null,
        drawnFrom: null,
      };

      if (pending.effect === "tenSwapDraw") {
        nextState = drawOneForPlayer(nextState, state.currentPlayerIndex).state;
      }

      return continueAfterDaifugo(nextState, pending.continue, nextState.players);
    }

    case "drawFromDeck": {
      if (state.phase !== "draw" || state.deck.length === 0) return state;
      const [drawnCard, ...deck] = state.deck;
      const player = state.players[state.currentPlayerIndex];
      const nextPlayer = { ...player, hand: sortCards([...player.hand, drawnCard]) };

      if (nextPlayer.hand.length !== player.hand.length + 1) {
        console.warn("Invalid draw state: drawing from deck did not add exactly one card to hand.");
        return state;
      }
      if (!player.hasCalled && nextPlayer.hand.length !== 11) {
        console.warn("Invalid state: discard phase requires 11 cards after drawing from deck.");
        return state;
      }

      return {
        ...state,
        deck,
        players: replacePlayer(state.players, state.currentPlayerIndex, nextPlayer),
        phase: "discard",
        drawnCard,
        drawnFrom: "deck",
        takenDiscardOwnerIndex: null,
        declaredReachThisTurn: false,
        message: player.isCpu ? `${player.name}（CPU）が山札から引きました。` : player.isReach
          ? "リーチ中です。上がれない場合は引いたカードをそのまま捨ててください。"
          : "捨てるカードを選んでください。",
      };
    }

    case "takeDiscard": {
      if (state.phase !== "draw") return state;
      const owner = state.players[action.ownerIndex];
      const discard = topDiscard(owner);
      if (!discard) return state;

      const ownerNext: Player = {
        ...owner,
        discardPile: owner.discardPile.slice(0, -1),
      };
      const player = state.players[state.currentPlayerIndex];
      let currentNext: Player;

      if (action.meld) {
        const handUsedIds = new Set(action.meld.filter((card) => card.id !== discard.id).map((card) => card.id));
        currentNext = {
          ...player,
          hand: sortCards(player.hand.filter((card) => !handUsedIds.has(card.id))),
          openMelds: [...player.openMelds, action.meld],
          hasCalled: true,
        };
      } else {
        currentNext = {
          ...player,
          hand: sortCards([...player.hand, discard]),
        };
      }

      const players = replacePlayer(
        replacePlayer(state.players, action.ownerIndex, ownerNext),
        state.currentPlayerIndex,
        currentNext,
      );

      return {
        ...state,
        players,
        phase: "discard",
        drawnCard: discard,
        drawnFrom: "discard",
        takenDiscardOwnerIndex: action.ownerIndex,
        declaredReachThisTurn: false,
        message: player.isCpu ? `${player.name}（CPU）が鳴きました。` : action.meld ? "鳴きました。捨てるカードを選んでください。" : "捨てるカードを選んでください。",
      };
    }

    case "declareReach": {
      if (state.phase !== "discard" || state.drawnFrom !== "deck") return state;
      const player = state.players[state.currentPlayerIndex];
      if (!canDeclareReachAfterDraw(player.hand, player.hasCalled, player.isReach)) return state;
      return {
        ...state,
        players: replacePlayer(state.players, state.currentPlayerIndex, { ...player, isReach: true }),
        declaredReachThisTurn: true,
        message: "リーチを宣言しました。1枚捨ててください。",
      };
    }

    case "answerReachAfterDiscard": {
      if (state.phase !== "reachConfirm") return state;
      const player = state.players[state.currentPlayerIndex];
      const players = action.declareReach
        ? replacePlayer(state.players, state.currentPlayerIndex, { ...player, isReach: true })
        : state.players;
      return advanceToNextDraw(state, players, state.currentPlayerIndex);
    }

    case "winWithDiscard": {
      if (state.phase !== "discard" || !state.drawnCard) return state;
      const player = state.players[state.currentPlayerIndex];
      const discardCard = player.hand.find((card) => card.id === action.discardCardId);
      if (!discardCard) return state;

      const options = findWinningDiscardsAfterDraw(player.hand, state.drawnCard.id, player.openMelds);
      const option = options.find((item) => item.discardCard.id === discardCard.id);
      if (!option) return state;

      const nextPlayer: Player = {
        ...player,
        hand: sortCards(player.hand.filter((card) => card.id !== discardCard.id)),
        discardPile: [...player.discardPile, discardCard],
        winningResult: option.winningResult,
      };
      const nextState = {
        ...state,
        players: replacePlayer(state.players, state.currentPlayerIndex, nextPlayer),
        declaredReachThisTurn: false,
      };
      const result = makeResult(
        nextState,
        state.currentPlayerIndex,
        state.drawnFrom === "discard" ? "ron" : "tsumo",
        option.winningResult,
        state.drawnFrom === "discard" ? state.takenDiscardOwnerIndex : null,
      );

      return { ...nextState, phase: "result", winner: state.currentPlayerIndex, result, pendingRonResult: null };
    }

    case "discard": {
      if (state.phase !== "discard") return state;
      const player = state.players[state.currentPlayerIndex];
      if (player.isReach && !state.declaredReachThisTurn) return state;

      const discardCard = player.hand.find((card) => card.id === action.cardId);
      if (!discardCard) return state;
      const shouldConfirmReach =
        state.drawnFrom === "deck" && canDeclareReachAfterDraw(player.hand, player.hasCalled, player.isReach);

      const handAfterDiscard = sortCards(player.hand.filter((card) => card.id !== discardCard.id));
      const winningResult = checkWinningHandWithOpenMelds(handAfterDiscard, player.openMelds);
      const nextPlayer: Player = {
        ...player,
        hand: handAfterDiscard,
        discardPile: [...player.discardPile, discardCard],
        winningResult: winningResult.canWin ? winningResult : player.winningResult,
      };
      const players = replacePlayer(state.players, state.currentPlayerIndex, nextPlayer);
      const nextState = { ...state, players };

      if (winningResult.canWin) {
        const result = makeResult(
          nextState,
          state.currentPlayerIndex,
          state.drawnFrom === "discard" ? "ron" : "tsumo",
          winningResult,
          state.drawnFrom === "discard" ? state.takenDiscardOwnerIndex : null,
        );
        return {
          ...nextState,
          phase: "result",
          winner: state.currentPlayerIndex,
          result,
          pendingRonResult: null,
          declaredReachThisTurn: false,
        };
      }

      if (state.deck.length === 0) {
        return deckoutResult(nextState, players);
      }

      const continueState: PendingDaifugoContinue = {
        shouldConfirmReach,
        message: player.isCpu ? `${player.name} (CPU) discarded ${formatCpuCard(discardCard)}.` : undefined,
      };
      const pendingDaifugoEffect = createPendingDaifugoEffect(nextState, discardCard, continueState);
      if (pendingDaifugoEffect) {
        return {
          ...nextState,
          pendingDaifugoEffect,
          message: getDaifugoConfirmMessage(pendingDaifugoEffect.effect),
        };
      }

      if (shouldConfirmReach) {
        return {
          ...nextState,
          phase: "reachConfirm",
          drawnCard: null,
          drawnFrom: null,
          lastDiscarderIndex: state.currentPlayerIndex,
          takenDiscardOwnerIndex: null,
          declaredReachThisTurn: false,
          message: "リーチを宣言しますか？",
        };
      }

      return advanceToNextDraw(
        nextState,
        players,
        state.currentPlayerIndex,
        player.isCpu ? `${player.name}（CPU）が ${formatCpuCard(discardCard)} を捨てました。` : undefined,
      );
    }

    case "discardDrawnOnly": {
      if (state.phase !== "discard" || !state.drawnCard) return state;
      const player = state.players[state.currentPlayerIndex];
      if (!player.isReach || state.declaredReachThisTurn) return state;
      const options = findWinningDiscardsAfterDraw(player.hand, state.drawnCard.id, player.openMelds);
      if (options.length > 0) return state;

      const nextPlayer: Player = {
        ...player,
        hand: sortCards(player.hand.filter((card) => card.id !== state.drawnCard?.id)),
        discardPile: [...player.discardPile, state.drawnCard],
      };
      const players = replacePlayer(state.players, state.currentPlayerIndex, nextPlayer);
      const nextState = { ...state, players };
      const continueState: PendingDaifugoContinue = {
        shouldConfirmReach: false,
        message: player.isCpu && state.drawnCard ? `${player.name} (CPU) discarded ${formatCpuCard(state.drawnCard)}.` : undefined,
      };
      const pendingDaifugoEffect = createPendingDaifugoEffect(nextState, state.drawnCard, continueState);
      if (pendingDaifugoEffect) {
        return {
          ...nextState,
          pendingDaifugoEffect,
          message: getDaifugoConfirmMessage(pendingDaifugoEffect.effect),
        };
      }

      return advanceToNextDraw(
        nextState,
        players,
        state.currentPlayerIndex,
        player.isCpu && state.drawnCard ? `${player.name}（CPU）が ${formatCpuCard(state.drawnCard)} を捨てました。` : undefined,
      );
    }

    default:
      return state;
  }
}

export function getReachWinningOptions(state: GameState) {
  const player = state.players[state.currentPlayerIndex];
  if (!player?.isReach || !state.drawnCard) return [];
  return findWinningDiscardsAfterDraw(player.hand, state.drawnCard.id, player.openMelds);
}

export function getAvailableDiscardSources(state: GameState): number[] {
  const current = state.players[state.currentPlayerIndex];
  if (!current || current.isReach) {
    return [];
  }

  const previousIndex = getNextPlayerIndex(
    state.currentPlayerIndex,
    state.players.length,
    state.direction === "clockwise" ? "counterclockwise" : "clockwise",
  );

  const discard = topDiscard(state.players[previousIndex]);
  return discard && findCallMeldOptions(current.hand, discard).length > 0 ? [previousIndex] : [];
}

export function getCallOptionsForSource(state: GameState, ownerIndex: number): Card[][] {
  const current = state.players[state.currentPlayerIndex];
  const previousIndex = getNextPlayerIndex(
    state.currentPlayerIndex,
    state.players.length,
    state.direction === "clockwise" ? "counterclockwise" : "clockwise",
  );
  if (ownerIndex !== previousIndex) return [];
  const discard = topDiscard(state.players[ownerIndex]);
  if (!current || !discard || current.isReach) return [];
  return findCallMeldOptions(current.hand, discard);
}
