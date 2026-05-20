import { describe, expect, it } from "vitest";
import type { Card, DaifugoOptions, GameState, Player } from "../types";
import { createDefaultDaifugoOptions } from "./deck";
import { gameReducer } from "./gameState";

function card(id: string, rank: number, suit: Card["suit"] = "S"): Card {
  return { id, rank, suit };
}

function player(index: number, hand: Card[], isCpu = false): Player {
  return {
    id: `player-${index}`,
    name: `Player ${index}`,
    type: isCpu ? "cpu" : "human",
    isCpu,
    cpuModelId: isCpu ? "standard" : undefined,
    hand,
    discardPile: [],
    openMelds: [],
    hasCalled: false,
    isReach: false,
  };
}

function daifugoOptions(overrides: Partial<DaifugoOptions["effects"]> = {}, enabled = true): DaifugoOptions {
  return {
    enabled,
    effects: {
      fiveSkip: true,
      sevenExchange: false,
      eightExtraTurn: true,
      nineReverse: true,
      tenSwapDraw: true,
      jackBack: true,
      queenNumberVanish: false,
      ...overrides,
    },
  };
}

function handWith(effectCard: Card): Card[] {
  return [
    effectCard,
    card("a-1", 1, "S"),
    card("a-2", 2, "H"),
    card("a-3", 3, "D"),
    card("a-4", 4, "C"),
    card("a-6", 6, "S"),
    card("a-7", 7, "H"),
    card("a-12", 12, "D"),
    card("a-13", 13, "C"),
    card("b-2", 2, "S"),
    card("b-4", 4, "H"),
  ];
}

function stateForDiscard(effectCard: Card, options = daifugoOptions()): GameState {
  return {
    players: [
      player(1, handWith(effectCard)),
      player(2, [card("p2-1", 1)]),
      player(3, [card("p3-1", 1)]),
    ],
    deck: [card("deck-1", 6), card("deck-2", 7), card("deck-3", 8)],
    currentPlayerIndex: 0,
    direction: "clockwise",
    daifugoOptions: options,
    pendingDaifugoEffect: null,
    isJBackActive: false,
    phase: "discard",
    drawnCard: card("drawn", 2),
    drawnFrom: "deck",
    lastDiscarderIndex: null,
    takenDiscardOwnerIndex: null,
    winner: null,
    result: null,
    pendingRonResult: null,
    showCpuActions: true,
    declaredReachThisTurn: false,
    message: "",
  };
}

describe("daifugo game state", () => {
  it("does not create an effect confirmation when daifugo is disabled", () => {
    const state = gameReducer(stateForDiscard(card("five", 5), daifugoOptions({}, false)), { type: "discard", cardId: "five" });

    expect(state.pendingDaifugoEffect).toBeNull();
    expect(state.phase).toBe("handoff");
  });

  it("does not create an effect confirmation when the individual effect is disabled", () => {
    const state = gameReducer(stateForDiscard(card("five", 5), daifugoOptions({ fiveSkip: false })), { type: "discard", cardId: "five" });

    expect(state.pendingDaifugoEffect).toBeNull();
    expect(state.phase).toBe("handoff");
  });

  it("skips the next player with the 5 effect", () => {
    const pending = gameReducer(stateForDiscard(card("five", 5)), { type: "discard", cardId: "five" });
    const resolved = gameReducer(pending, { type: "answerDaifugoEffect", activate: true });
    const next = gameReducer(resolved, { type: "confirmHandoff" });

    expect(resolved.lastDiscarderIndex).toBe(1);
    expect(next.currentPlayerIndex).toBe(2);
  });

  it("exchanges one card with the next player using the 7 effect", () => {
    const pending = gameReducer(stateForDiscard(card("seven", 7), daifugoOptions({ sevenExchange: true })), { type: "discard", cardId: "seven" });
    const selecting = gameReducer(pending, { type: "answerDaifugoEffect", activate: true });
    const selectedByUser = gameReducer(selecting, { type: "selectSevenExchangeCard", playerIndex: 0, cardId: "a-1" });
    const resolved = gameReducer(selectedByUser, { type: "selectSevenExchangeCard", playerIndex: 1, cardId: "p2-1" });

    expect(resolved.pendingDaifugoEffect).toBeNull();
    expect(resolved.players[0].hand.some((item) => item.id === "p2-1")).toBe(true);
    expect(resolved.players[1].hand.some((item) => item.id === "a-1")).toBe(true);
  });

  it("removes the selected rank from hands and deck using the Q effect", () => {
    const pending = gameReducer(stateForDiscard(card("queen", 12), daifugoOptions({ queenNumberVanish: true })), { type: "discard", cardId: "queen" });
    const selecting = gameReducer(pending, { type: "answerDaifugoEffect", activate: true });
    const resolved = gameReducer(selecting, { type: "selectQueenVanishRank", rank: 7 });

    expect(resolved.pendingDaifugoEffect).toBeNull();
    expect(resolved.players.flatMap((candidate) => candidate.hand).some((item) => item.rank === 7)).toBe(false);
    expect(resolved.deck.some((item) => item.rank === 7)).toBe(false);
    expect(resolved.players[0].discardPile.some((item) => item.id === "a-7")).toBe(true);
    expect(resolved.players[0].hand.some((item) => item.id === "deck-1")).toBe(true);
  });

  it("reverses direction with the 9 effect and applies 5 skip in that direction", () => {
    const reversedPending = gameReducer(stateForDiscard(card("nine", 9)), { type: "discard", cardId: "nine" });
    const reversed = gameReducer(reversedPending, { type: "answerDaifugoEffect", activate: true });
    expect(reversed.direction).toBe("counterclockwise");

    const fiveState = {
      ...stateForDiscard(card("five", 5)),
      direction: reversed.direction,
    };
    const fivePending = gameReducer(fiveState, { type: "discard", cardId: "five" });
    const fiveResolved = gameReducer(fivePending, { type: "answerDaifugoEffect", activate: true });
    const next = gameReducer(fiveResolved, { type: "confirmHandoff" });

    expect(fiveResolved.lastDiscarderIndex).toBe(2);
    expect(next.currentPlayerIndex).toBe(1);
  });

  it("toggles J-back and clears it with the 8 effect", () => {
    const jackPending = gameReducer(stateForDiscard(card("jack", 11)), { type: "discard", cardId: "jack" });
    const jBack = gameReducer(jackPending, { type: "answerDaifugoEffect", activate: true });
    expect(jBack.isJBackActive).toBe(true);

    const eightPending = gameReducer({ ...stateForDiscard(card("eight", 8)), isJBackActive: true }, { type: "discard", cardId: "eight" });
    const drawPending = gameReducer(eightPending, { type: "answerDaifugoEffect", activate: true });
    expect(drawPending.isJBackActive).toBe(false);
    expect(drawPending.pendingDaifugoEffect?.kind).toBe("effectDraw");
    expect(drawPending.currentPlayerIndex).toBe(0);
  });

  it("resolves 8 extra discard without chaining another daifugo effect", () => {
    const pending = gameReducer(stateForDiscard(card("eight", 8)), { type: "discard", cardId: "eight" });
    const drawPending = gameReducer(pending, { type: "answerDaifugoEffect", activate: true });
    const extra = gameReducer(drawPending, { type: "drawForDaifugoEffect" });
    const resolved = gameReducer(extra, { type: "discardForDaifugoEffect", cardId: "deck-1" });

    expect(resolved.pendingDaifugoEffect).toBeNull();
    expect(resolved.phase).toBe("handoff");
  });

  it("resolves 10 extra discard and draws one without chaining another daifugo effect", () => {
    const pending = gameReducer(stateForDiscard(card("ten", 10)), { type: "discard", cardId: "ten" });
    const extra = gameReducer(pending, { type: "answerDaifugoEffect", activate: true });
    const handBefore = extra.players[0].hand.length;
    const deckBefore = extra.deck.length;
    const drawPending = gameReducer(extra, { type: "discardForDaifugoEffect", cardId: "a-1" });
    const resolved = gameReducer(drawPending, { type: "drawForDaifugoEffect" });

    expect(resolved.pendingDaifugoEffect).toBeNull();
    expect(resolved.phase).toBe("handoff");
    expect(resolved.players[0].hand.length).toBe(handBefore);
    expect(resolved.deck.length).toBe(deckBefore - 1);
  });

  it("adds the drawn card to hand after the 8 effect draw", () => {
    const pending = gameReducer(stateForDiscard(card("eight", 8)), { type: "discard", cardId: "eight" });
    const drawPending = gameReducer(pending, { type: "answerDaifugoEffect", activate: true });
    const extra = gameReducer(drawPending, { type: "drawForDaifugoEffect" });

    expect(extra.players[0].hand.some((item) => item.id === "deck-1")).toBe(true);
    expect(extra.drawnCard?.id).toBe("deck-1");
    expect(extra.pendingDaifugoEffect?.kind).toBe("extraDiscard");
  });

  it("allows tsumo after the 8 effect draw and extra discard completes a hand", () => {
    const state = stateForDiscard(card("eight", 8));
    state.players[0] = player(1, [
      card("eight", 8),
      card("t1s", 1, "S"),
      card("t1h", 1, "H"),
      card("t1d", 1, "D"),
      card("t2s", 2, "S"),
      card("t2h", 2, "H"),
      card("t2d", 2, "D"),
      card("t3s", 3, "S"),
      card("t3h", 3, "H"),
      card("key", 13, "C"),
      card("junk", 12, "D"),
    ]);
    state.deck = [card("t3d", 3, "D")];

    const pending = gameReducer(state, { type: "discard", cardId: "eight" });
    const drawPending = gameReducer(pending, { type: "answerDaifugoEffect", activate: true });
    const extra = gameReducer(drawPending, { type: "drawForDaifugoEffect" });
    const result = gameReducer(extra, { type: "discardForDaifugoEffect", cardId: "junk" });

    expect(result.phase).toBe("result");
    expect(result.result?.winType).toBe("tsumo");
  });

  it("allows reach declaration after the 8 effect draw", () => {
    const state = stateForDiscard(card("eight", 8));
    state.players[0] = player(1, [
      card("eight", 8),
      card("r1", 1, "S"),
      card("r2", 2, "S"),
      card("r3", 3, "S"),
      card("r4", 4, "S"),
      card("r5", 5, "S"),
      card("loose-a", 9, "D"),
      card("loose-b", 10, "H"),
      card("loose-c", 11, "H"),
      card("loose-d", 12, "H"),
      card("junk", 13, "H"),
    ]);
    state.deck = [card("r6", 6, "S")];
    const pending = gameReducer(state, { type: "discard", cardId: "eight" });
    const drawPending = gameReducer(pending, { type: "answerDaifugoEffect", activate: true });
    const extra = gameReducer(drawPending, { type: "drawForDaifugoEffect" });
    const reached = gameReducer(extra, { type: "declareReach" });

    expect(reached.players[0].isReach).toBe(true);
    expect(reached.pendingDaifugoEffect?.kind).toBe("extraDiscard");
  });

  it("allows tsumo after the 10 effect draw completes a hand", () => {
    const state = stateForDiscard(card("ten", 10));
    state.players[0] = player(1, [
      card("ten", 10),
      card("r1", 1, "S"),
      card("r2", 2, "S"),
      card("r3", 3, "S"),
      card("r4", 4, "S"),
      card("r5", 5, "S"),
      card("r6", 6, "S"),
      card("r7", 7, "S"),
      card("r8", 8, "S"),
      card("key", 13, "C"),
      card("junk", 12, "D"),
    ]);
    state.deck = [card("r9", 9, "S")];

    const pending = gameReducer(state, { type: "discard", cardId: "ten" });
    const extra = gameReducer(pending, { type: "answerDaifugoEffect", activate: true });
    const drawPending = gameReducer(extra, { type: "discardForDaifugoEffect", cardId: "junk" });
    const result = gameReducer(drawPending, { type: "drawForDaifugoEffect" });

    expect(result.phase).toBe("result");
    expect(result.result?.winType).toBe("tsumo");
  });

  it("allows reach confirmation after the 10 effect draw meets reach conditions", () => {
    const state = stateForDiscard(card("ten", 10));
    state.players[0] = player(1, [
      card("ten", 10),
      card("r1", 1, "S"),
      card("r2", 2, "S"),
      card("r3", 3, "S"),
      card("r4", 4, "S"),
      card("r5", 5, "S"),
      card("key", 13, "C"),
      card("loose-a", 2, "H"),
      card("loose-b", 5, "H"),
      card("loose-c", 9, "H"),
      card("junk", 12, "D"),
    ]);
    state.deck = [card("r6", 6, "S")];

    const pending = gameReducer(state, { type: "discard", cardId: "ten" });
    const extra = gameReducer(pending, { type: "answerDaifugoEffect", activate: true });
    const drawPending = gameReducer(extra, { type: "discardForDaifugoEffect", cardId: "junk" });
    const reachConfirm = gameReducer(drawPending, { type: "drawForDaifugoEffect" });

    expect(reachConfirm.phase).toBe("reachConfirm");
  });

  it("locks other reducer actions while an effect confirmation is pending", () => {
    const pending = gameReducer(stateForDiscard(card("five", 5)), { type: "discard", cardId: "five" });
    const attemptedDraw = gameReducer(pending, { type: "drawFromDeck" });

    expect(attemptedDraw).toBe(pending);
  });

  it("does not activate the 10 effect while the player is in reach", () => {
    const state = stateForDiscard(card("ten", 10));
    state.players[0] = { ...state.players[0], isReach: true };
    state.drawnCard = state.players[0].hand.find((item) => item.id === "ten") ?? null;

    const resolved = gameReducer(state, { type: "discardDrawnOnly" });

    expect(resolved.pendingDaifugoEffect).toBeNull();
    expect(resolved.phase).toBe("handoff");
  });

  it("allows the 8 effect during reach but only discards the drawn card afterward", () => {
    const state = stateForDiscard(card("eight", 8));
    state.players[0] = { ...state.players[0], isReach: true };
    state.drawnCard = state.players[0].hand.find((item) => item.id === "eight") ?? null;

    const pending = gameReducer(state, { type: "discardDrawnOnly" });
    expect(pending.pendingDaifugoEffect?.kind).toBe("confirm");
    expect(pending.pendingDaifugoEffect?.effect).toBe("eightExtraTurn");

    const drawPending = gameReducer(pending, { type: "answerDaifugoEffect", activate: true });
    const extra = gameReducer(drawPending, { type: "drawForDaifugoEffect" });
    const rejected = gameReducer(extra, { type: "discardForDaifugoEffect", cardId: "a-1" });
    const resolved = gameReducer(extra, { type: "discardForDaifugoEffect", cardId: "deck-1" });

    expect(rejected).toBe(extra);
    expect(resolved.phase).toBe("handoff");
    expect(resolved.players[0].discardPile.at(-1)?.id).toBe("deck-1");
  });

  it("applies J-back losses to result scoring", () => {
    const state = stateForDiscard(card("junk", 13));
    state.isJBackActive = true;
    state.players[0] = player(1, [
      card("r1", 1, "S"),
      card("r2", 2, "S"),
      card("r3", 3, "S"),
      card("r4", 4, "S"),
      card("r5", 5, "S"),
      card("r6", 6, "S"),
      card("loose-a", 9, "D"),
      card("loose-b", 10, "H"),
      card("loose-c", 11, "H"),
      card("loose-d", 12, "H"),
      card("junk", 13, "H"),
    ]);
    state.players[1] = player(2, [card("p2-6", 6)]);
    state.players[2] = player(3, [card("p3-6", 6)]);
    state.drawnCard = state.players[0].hand.find((item) => item.id === "r6") ?? null;

    const result = gameReducer(state, { type: "discard", cardId: "junk" });

    expect(result.phase).toBe("result");
    expect(result.result?.score.playerLosses).toEqual([5, 8, 8]);
  });
});
