import type { Card, Direction, GameResult, GameState, Player, RonResult } from "../types";
import { createDeck, dealCards, shuffleDeck, sortCards } from "./deck";
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

export function createInitialGame(playerCount: number, direction: Direction): GameState {
  return dealCards(shuffleDeck(createDeck()), playerCount, direction);
}

function replacePlayer(players: Player[], index: number, nextPlayer: Player): Player[] {
  return players.map((player, playerIndex) => (playerIndex === index ? nextPlayer : player));
}

function topDiscard(player: Player): Card | null {
  return player.discardPile[player.discardPile.length - 1] ?? null;
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
      ? calculateRonScore(state.players, winnerIndex, discarderIndex, winningResult)
      : calculateTsumoScore(state.players, winnerIndex, winningResult);

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

function findReachRonResults(players: Player[], discarderIndex: number, discardCard: Card): Array<RonResult & { player: Player }> {
  return players
    .map((player, winnerIndex) => {
      if (winnerIndex === discarderIndex || !player.isReach) return null;
      const options = findWinningDiscardsAfterDraw([...player.hand, discardCard], discardCard.id, player.openMelds);
      const option = options[0];
      if (!option) return null;

      return {
        winnerIndex,
        winningResult: option.winningResult,
        score: calculateRonScore(players, winnerIndex, discarderIndex, option.winningResult),
        player: { ...player, winningResult: option.winningResult },
      };
    })
    .filter((result): result is RonResult & { player: Player } => Boolean(result));
}

function makeReachRonResult(state: GameState, discarderIndex: number): { result: GameResult; players: Player[] } | null {
  const discardCard = topDiscard(state.players[discarderIndex]);
  if (!discardCard) return null;

  const ronCandidates = findReachRonResults(state.players, discarderIndex, discardCard);
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
    return fallback.keyCard ? calculateCardLoss(fallback.keyCard) : Math.min(...candidate.hand.map(calculateCardLoss));
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
  return { ...deckoutState, phase: "result", winner: winnerIndex, result, declaredReachThisTurn: false };
}

function advanceToNextDraw(state: GameState, players: Player[], discarderIndex: number): GameState {
  const ron = makeReachRonResult({ ...state, players }, discarderIndex);
  if (ron) {
    return {
      ...state,
      players: ron.players,
      phase: "result",
      winner: ron.result.winnerIndex,
      result: ron.result,
      declaredReachThisTurn: false,
    };
  }

  // TODO: If ron interruption needs a visible UI later, add a 3-second wait after every discard.
  return {
    ...state,
    players,
    currentPlayerIndex: getNextPlayerIndex(discarderIndex, state.players.length, state.direction),
    phase: "draw",
    drawnCard: null,
    drawnFrom: null,
    lastDiscarderIndex: discarderIndex,
    takenDiscardOwnerIndex: null,
    declaredReachThisTurn: false,
    message: "カードを1枚取ってください。",
  };
}

export type GameAction =
  | { type: "start"; playerCount: number; direction: Direction }
  | { type: "confirmHandoff" }
  | { type: "drawFromDeck" }
  | { type: "takeDiscard"; ownerIndex: number; meld?: Card[] }
  | { type: "declareReach" }
  | { type: "answerReachAfterDiscard"; declareReach: boolean }
  | { type: "discard"; cardId: string }
  | { type: "discardDrawnOnly" }
  | { type: "winWithDiscard"; discardCardId: string }
  | { type: "restart" };

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "start":
      return createInitialGame(action.playerCount, action.direction);

    case "restart":
      return {
        players: [],
        deck: [],
        currentPlayerIndex: 0,
        direction: "clockwise",
        phase: "setup",
        drawnCard: null,
        drawnFrom: null,
        lastDiscarderIndex: null,
        takenDiscardOwnerIndex: null,
        winner: null,
        result: null,
        declaredReachThisTurn: false,
        message: "",
      };

    case "confirmHandoff":
      return { ...state, phase: "draw", message: "カードを1枚取ってください。" };

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
        message: player.isReach
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
        message: action.meld ? "鳴きました。捨てるカードを選んでください。" : "捨てるカードを選んでください。",
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

      return { ...nextState, phase: "result", winner: state.currentPlayerIndex, result };
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
        return { ...nextState, phase: "result", winner: state.currentPlayerIndex, result, declaredReachThisTurn: false };
      }

      if (state.deck.length === 0) {
        return deckoutResult(nextState, players);
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

      return advanceToNextDraw(nextState, players, state.currentPlayerIndex);
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

      return advanceToNextDraw({ ...state, players }, players, state.currentPlayerIndex);
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
