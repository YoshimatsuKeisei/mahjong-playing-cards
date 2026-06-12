import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultDaifugoOptions } from "../src/game/deck";
import type { Card, GameState, Player } from "../src/types";
import { cancelOnlineCpu, scheduleOnlineCpu } from "./onlineCpuRunner";

type TestRoom = {
  id: string;
  state: GameState | null;
  stateVersion: number;
  started: boolean;
};

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

function hand(prefix: string): Card[] {
  return [
    card(`${prefix}-1s`, 1, "S"),
    card(`${prefix}-1h`, 1, "H"),
    card(`${prefix}-4s`, 4, "S"),
    card(`${prefix}-4h`, 4, "H"),
    card(`${prefix}-7s`, 7, "S"),
    card(`${prefix}-7h`, 7, "H"),
    card(`${prefix}-10s`, 10, "S"),
    card(`${prefix}-10h`, 10, "H"),
    card(`${prefix}-13s`, 13, "S"),
    card(`${prefix}-13h`, 13, "H"),
  ];
}

function baseState(overrides: Partial<GameState> = {}): GameState {
  return {
    players: [
      player(1, hand("p1")),
      player(2, hand("cpu"), true),
      player(3, hand("p3")),
    ],
    deck: [card("deck-1", 11), card("deck-2", 12), card("deck-3", 13)],
    currentPlayerIndex: 1,
    direction: "clockwise",
    daifugoOptions: createDefaultDaifugoOptions(),
    pendingDaifugoEffect: null,
    isJBackActive: false,
    phase: "draw",
    drawnCard: null,
    drawnFrom: null,
    lastDiscarderIndex: 0,
    takenDiscardOwnerIndex: null,
    winner: null,
    result: null,
    pendingRonResult: null,
    queenVanishedRanks: [],
    showCpuActions: true,
    declaredReachThisTurn: false,
    message: "",
    ...overrides,
  };
}

function createRoom(state: GameState, id = "room-1"): TestRoom {
  return {
    id,
    state,
    stateVersion: 0,
    started: true,
  };
}

function createCallbacks() {
  return {
    applyNextState: vi.fn((room: TestRoom, nextState: GameState) => {
      room.stateVersion += 1;
      room.state = { ...nextState, stateVersion: room.stateVersion };
    }),
    broadcastPlayerView: vi.fn(),
  };
}

async function advanceOnlineCpu() {
  await vi.advanceTimersToNextTimerAsync();
}

describe("online CPU runner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cancelOnlineCpu("room-1");
    cancelOnlineCpu("room-2");
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("schedules and applies a CPU draw action", async () => {
    const room = createRoom(baseState());
    const callbacks = createCallbacks();

    scheduleOnlineCpu(room, callbacks);
    await advanceOnlineCpu();

    expect(callbacks.applyNextState).toHaveBeenCalledTimes(1);
    expect(callbacks.broadcastPlayerView).toHaveBeenCalledTimes(1);
    expect(room.state?.phase).toBe("discard");
    expect(room.state?.drawnCard?.id).toBe("deck-1");
  });

  it("does not schedule an action for a human current player", async () => {
    const room = createRoom(baseState({ currentPlayerIndex: 0 }));
    const callbacks = createCallbacks();

    scheduleOnlineCpu(room, callbacks);
    await advanceOnlineCpu();

    expect(callbacks.applyNextState).not.toHaveBeenCalled();
    expect(callbacks.broadcastPlayerView).not.toHaveBeenCalled();
  });

  it("schedules and applies a CPU discard action", async () => {
    const drawnCard = card("drawn", 12);
    const state = baseState({
      phase: "discard",
      drawnCard,
      drawnFrom: "deck",
      players: [
        player(1, hand("p1")),
        player(2, [...hand("cpu"), drawnCard], true),
        player(3, hand("p3")),
      ],
    });
    const room = createRoom(state);
    const callbacks = createCallbacks();

    scheduleOnlineCpu(room, callbacks);
    await advanceOnlineCpu();

    expect(callbacks.applyNextState).toHaveBeenCalledTimes(1);
    expect(callbacks.broadcastPlayerView).toHaveBeenCalledTimes(1);
    expect(room.state?.phase).toBe("handoff");
    expect(room.state?.lastDiscarderIndex).toBe(1);
    expect(room.state?.players[1].discardPile.length).toBe(1);
  });

  it("confirms handoff without depending on the current player being CPU", async () => {
    const room = createRoom(
      baseState({
        phase: "handoff",
        currentPlayerIndex: 0,
        lastDiscarderIndex: 0,
      }),
    );
    const callbacks = createCallbacks();

    scheduleOnlineCpu(room, callbacks);
    await advanceOnlineCpu();

    expect(callbacks.applyNextState).toHaveBeenCalledTimes(1);
    expect(callbacks.broadcastPlayerView).toHaveBeenCalledTimes(1);
    expect(room.state?.phase).toBe("draw");
    expect(room.state?.currentPlayerIndex).toBe(1);
  });

  it("answers a pending CPU daifugo confirmation", async () => {
    const room = createRoom(
      baseState({
        pendingDaifugoEffect: {
          kind: "confirm",
          effect: "fiveSkip",
          playerIndex: 1,
          continue: { shouldConfirmReach: false },
        },
      }),
    );
    const callbacks = createCallbacks();

    scheduleOnlineCpu(room, callbacks);
    await advanceOnlineCpu();

    expect(callbacks.applyNextState).toHaveBeenCalledTimes(1);
    expect(callbacks.broadcastPlayerView).toHaveBeenCalledTimes(1);
    expect(room.state?.pendingDaifugoEffect).toBeNull();
  });

  it("selects a queen vanish rank for a pending CPU queen effect", async () => {
    const room = createRoom(
      baseState({
        daifugoOptions: {
          enabled: true,
          effects: {
            ...createDefaultDaifugoOptions().effects,
            queenNumberVanish: true,
          },
        },
        pendingDaifugoEffect: {
          kind: "queenSelect",
          effect: "queenNumberVanish",
          playerIndex: 1,
          continue: { shouldConfirmReach: false },
        },
      }),
    );
    const callbacks = createCallbacks();

    scheduleOnlineCpu(room, callbacks);
    await advanceOnlineCpu();

    expect(callbacks.applyNextState).toHaveBeenCalledTimes(1);
    expect(callbacks.broadcastPlayerView).toHaveBeenCalledTimes(1);
    expect(room.state?.pendingDaifugoEffect?.kind).not.toBe("queenSelect");
  });

  it("selects only the missing CPU card during a seven exchange", async () => {
    const cpuGive = card("cpu-give", 1);
    const targetGive = card("target-give", 13);
    const room = createRoom(
      baseState({
        daifugoOptions: {
          enabled: true,
          effects: {
            ...createDefaultDaifugoOptions().effects,
            sevenExchange: true,
          },
        },
        players: [
          player(1, hand("p1")),
          player(2, [cpuGive, ...hand("cpu").slice(1)], true),
          player(3, [targetGive, ...hand("p3").slice(1)]),
        ],
        pendingDaifugoEffect: {
          kind: "sevenExchange",
          effect: "sevenExchange",
          playerIndex: 1,
          targetPlayerIndex: 2,
          selections: { 2: targetGive.id },
          continue: { shouldConfirmReach: false },
        },
      }),
    );
    const callbacks = createCallbacks();

    scheduleOnlineCpu(room, callbacks);
    await advanceOnlineCpu();

    expect(callbacks.applyNextState).toHaveBeenCalledTimes(1);
    expect(callbacks.broadcastPlayerView).toHaveBeenCalledTimes(1);
    expect(room.state?.pendingDaifugoEffect).toBeNull();
    expect(room.state?.players[1].hand.some((item) => item.id === targetGive.id))
      .toBe(true);
  });

  it("does not execute the same scheduled CPU action twice", async () => {
    const room = createRoom(baseState());
    const callbacks = createCallbacks();

    scheduleOnlineCpu(room, callbacks);
    scheduleOnlineCpu(room, callbacks);
    await advanceOnlineCpu();

    expect(callbacks.applyNextState).toHaveBeenCalledTimes(1);
  });

  it("ignores a scheduled action after the room state version changes", async () => {
    const room = createRoom(baseState());
    const callbacks = createCallbacks();

    scheduleOnlineCpu(room, callbacks);
    room.stateVersion += 1;
    await advanceOnlineCpu();

    expect(callbacks.applyNextState).not.toHaveBeenCalled();
    expect(callbacks.broadcastPlayerView).not.toHaveBeenCalled();
  });

  it("cancels a scheduled CPU action", async () => {
    const room = createRoom(baseState());
    const callbacks = createCallbacks();

    scheduleOnlineCpu(room, callbacks);
    cancelOnlineCpu(room.id);
    await advanceOnlineCpu();

    expect(callbacks.applyNextState).not.toHaveBeenCalled();
  });

});
