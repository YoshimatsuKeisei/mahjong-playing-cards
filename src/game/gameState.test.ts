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
    const extra = gameReducer(eightPending, { type: "answerDaifugoEffect", activate: true });
    expect(extra.isJBackActive).toBe(false);
    expect(extra.pendingDaifugoEffect?.kind).toBe("extraDiscard");
    expect(extra.currentPlayerIndex).toBe(0);
  });

  it("resolves 8 extra discard without chaining another daifugo effect", () => {
    const pending = gameReducer(stateForDiscard(card("eight", 8)), { type: "discard", cardId: "eight" });
    const extra = gameReducer(pending, { type: "answerDaifugoEffect", activate: true });
    const resolved = gameReducer(extra, { type: "discardForDaifugoEffect", cardId: "deck-1" });

    expect(resolved.pendingDaifugoEffect).toBeNull();
    expect(resolved.phase).toBe("handoff");
  });

  it("resolves 10 extra discard and draws one without chaining another daifugo effect", () => {
    const pending = gameReducer(stateForDiscard(card("ten", 10)), { type: "discard", cardId: "ten" });
    const extra = gameReducer(pending, { type: "answerDaifugoEffect", activate: true });
    const handBefore = extra.players[0].hand.length;
    const deckBefore = extra.deck.length;
    const resolved = gameReducer(extra, { type: "discardForDaifugoEffect", cardId: "a-1" });

    expect(resolved.pendingDaifugoEffect).toBeNull();
    expect(resolved.phase).toBe("handoff");
    expect(resolved.players[0].hand.length).toBe(handBefore);
    expect(resolved.deck.length).toBe(deckBefore - 1);
  });

  it("locks other reducer actions while an effect confirmation is pending", () => {
    const pending = gameReducer(stateForDiscard(card("five", 5)), { type: "discard", cardId: "five" });
    const attemptedDraw = gameReducer(pending, { type: "drawFromDeck" });

    expect(attemptedDraw).toBe(pending);
  });
});
