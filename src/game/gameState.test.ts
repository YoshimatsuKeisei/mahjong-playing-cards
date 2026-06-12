import { describe, expect, it } from "vitest";
import type { Card, DaifugoOptions, GameState, Player } from "../types";
import { createDebugDaifugoState } from "../App";
import { createDefaultDaifugoOptions } from "./deck";
import {
  gameReducer,
  getEnhancedFiveTurnOptions,
  getJackShieldRunOptions,
  getNextPlayerIndex,
  getQueenVanishRankOptions,
  getSevenExchangeCandidateCards,
} from "./gameState";

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

function replacePlayerForTest(players: Player[], playerIndex: number, nextPlayer: Player): Player[] {
  return players.map((candidate, index) => (index === playerIndex ? nextPlayer : candidate));
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

function stateForFivePlayerDiscard(effectCard: Card, direction: GameState["direction"] = "clockwise", options = daifugoOptions()): GameState {
  return {
    ...stateForDiscard(effectCard, options),
    players: [
      player(1, handWith(effectCard)),
      player(2, [card("p2-1", 1)]),
      player(3, [card("p3-1", 1)]),
      player(4, [card("p4-1", 1)]),
      player(5, [card("p5-1", 1)]),
    ],
    direction,
  };
}

function stateForTacticalSevenThreat(
  playerCount: number,
  currentPlayerIndex: number,
  direction: GameState["direction"],
  threat: "reach" | "two-call",
  threatOffset = 2,
  hasJEnhancementRight = true,
): { state: GameState; targetPlayerIndex: number } {
  const seven = card("seven", 7);
  let targetPlayerIndex = currentPlayerIndex;
  for (let count = 0; count < threatOffset; count += 1) {
    targetPlayerIndex = getNextPlayerIndex(targetPlayerIndex, playerCount, direction);
  }
  const state = {
    ...stateForDiscard(seven, daifugoOptions({ sevenExchange: true })),
    currentPlayerIndex,
    direction,
    players: Array.from({ length: playerCount }, (_, index) => {
      const candidate = player(index + 1, index === currentPlayerIndex ? handWith(seven) : [card(`p${index + 1}-1`, 1)]);
      if (index === currentPlayerIndex) {
        return {
          ...candidate,
          isCpu: true,
          type: "cpu" as const,
          cpuModelId: "tactical" as const,
          hasJEnhancementRight,
        };
      }
      if (index !== targetPlayerIndex) return candidate;
      return threat === "reach"
        ? { ...candidate, isReach: true }
        : { ...candidate, openMelds: [[card("two-call-1", 1)], [card("two-call-2", 2)]] };
    }),
  };
  return { state, targetPlayerIndex };
}

describe("daifugo game state", () => {
  it("reevaluates a master 7 threat target while tactical keeps its pending response mode", () => {
    const createState = (cpuModelId: "tactical" | "master") => {
      const seven = card("seven", 7);
      const base = stateForDiscard(seven, daifugoOptions({ sevenExchange: true }));
      return {
        ...base,
        players: [
          {
            ...player(1, handWith(seven), true),
            cpuModelId,
            hasJEnhancementRight: true,
          },
          {
            ...player(2, [card("p2-1", 1)]),
            openMelds: [[card("two-call-1", 1)], [card("two-call-2", 2)]],
          },
          {
            ...player(3, [card("p3-1", 1)]),
            isReach: true,
          },
        ],
        pendingDaifugoEffect: {
          kind: "confirm" as const,
          effect: "sevenExchange" as const,
          playerIndex: 0,
          continue: { shouldConfirmReach: false },
          cpuThreatResponseMode: "twoCall" as const,
        },
      };
    };

    const tactical = gameReducer(createState("tactical"), { type: "answerDaifugoEffect", activate: true });
    const master = gameReducer(createState("master"), { type: "answerDaifugoEffect", activate: true });

    expect(tactical.pendingDaifugoEffect).toEqual(expect.objectContaining({ kind: "sevenExchange", targetPlayerIndex: 1 }));
    expect(master.pendingDaifugoEffect).toEqual(expect.objectContaining({ kind: "sevenExchange", targetPlayerIndex: 2 }));
  });

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
    expect(resolved.daifugoEffectEvent?.kind).toBe("sevenExchange");
  });

  it("shows J enhancement confirmation only when a human 7 user has the right", () => {
    const withoutRight = gameReducer(stateForDiscard(card("seven", 7), daifugoOptions({ sevenExchange: true })), {
      type: "discard",
      cardId: "seven",
    });
    const normal = gameReducer(withoutRight, { type: "answerDaifugoEffect", activate: true });
    expect(normal.pendingDaifugoEffect?.kind).toBe("sevenExchange");

    const withRightBase = stateForDiscard(card("seven", 7), daifugoOptions({ sevenExchange: true }));
    const withRight = gameReducer(
      {
        ...withRightBase,
        players: withRightBase.players.map((candidate, index) => (index === 0 ? { ...candidate, hasJEnhancementRight: true } : candidate)),
      },
      { type: "discard", cardId: "seven" },
    );
    const confirming = gameReducer(withRight, { type: "answerDaifugoEffect", activate: true });
    expect(confirming.pendingDaifugoEffect?.kind).toBe("sevenEnhancementConfirm");
    expect(confirming.players[0].hasJEnhancementRight).toBe(true);
  });

  it("keeps the enhancement right when declining enhanced 7 and starts normal 7", () => {
    const base = stateForDiscard(card("seven", 7), daifugoOptions({ sevenExchange: true }));
    const pending = gameReducer(
      { ...base, players: base.players.map((candidate, index) => (index === 0 ? { ...candidate, hasJEnhancementRight: true } : candidate)) },
      { type: "discard", cardId: "seven" },
    );
    const confirming = gameReducer(pending, { type: "answerDaifugoEffect", activate: true });
    const normal = gameReducer(confirming, { type: "answerSevenEnhancement", useEnhancement: false });

    expect(normal.pendingDaifugoEffect).toMatchObject({
      kind: "sevenExchange",
      playerIndex: 0,
      targetPlayerIndex: 1,
    });
    expect(normal.players[0].hasJEnhancementRight).toBe(true);
  });

  it("selects any opponent for enhanced 7 and consumes the right only after exchange completion", () => {
    const base = stateForDiscard(card("seven", 7), daifugoOptions({ sevenExchange: true }));
    const pending = gameReducer(
      { ...base, players: base.players.map((candidate, index) => (index === 0 ? { ...candidate, hasJEnhancementRight: true } : candidate)) },
      { type: "discard", cardId: "seven" },
    );
    const confirming = gameReducer(pending, { type: "answerDaifugoEffect", activate: true });
    const splashing = gameReducer(confirming, { type: "answerSevenEnhancement", useEnhancement: true });
    expect(splashing.pendingDaifugoEffect?.kind).toBe("sevenEnhancementSplash");
    expect(splashing.players[0].hasJEnhancementRight).toBe(true);

    const choosingTarget = gameReducer(splashing, { type: "finishSevenEnhancementSplash" });
    expect(choosingTarget.pendingDaifugoEffect?.kind).toBe("sevenEnhancedTargetSelect");
    expect(choosingTarget.players[0].hasJEnhancementRight).toBe(true);

    const selectedTarget = gameReducer(choosingTarget, { type: "selectEnhancedSevenTarget", targetPlayerIndex: 2 });
    expect(selectedTarget.pendingDaifugoEffect).toMatchObject({ kind: "sevenEnhancedTargetSelect", selectedTargetPlayerIndex: 2 });
    expect(selectedTarget.players[0].hasJEnhancementRight).toBe(true);

    const exchange = gameReducer(selectedTarget, { type: "confirmEnhancedSevenTarget" });
    expect(exchange.pendingDaifugoEffect).toMatchObject({
      kind: "sevenExchange",
      playerIndex: 0,
      targetPlayerIndex: 2,
      consumeJEnhancementRightOnComplete: true,
    });
    expect(exchange.players[0].hasJEnhancementRight).toBe(true);

    const selectedByUser = gameReducer(exchange, { type: "selectSevenExchangeCard", playerIndex: 0, cardId: "a-1" });
    const resolved = gameReducer(selectedByUser, { type: "selectSevenExchangeCard", playerIndex: 2, cardId: "p3-1" });
    expect(resolved.pendingDaifugoEffect).toBeNull();
    expect(resolved.players[0].hand.some((item) => item.id === "p3-1")).toBe(true);
    expect(resolved.players[2].hand.some((item) => item.id === "a-1")).toBe(true);
    expect(resolved.players[0].hasJEnhancementRight).toBe(false);
    expect(resolved.daifugoEffectEvent).toMatchObject({
      kind: "sevenExchange",
      actorIndex: 0,
      targetPlayerIndex: 2,
    });
  });

  it("does not consume the enhancement right when the 7 effect itself is declined", () => {
    const base = stateForDiscard(card("seven", 7), daifugoOptions({ sevenExchange: true }));
    const pending = gameReducer(
      { ...base, players: base.players.map((candidate, index) => (index === 0 ? { ...candidate, hasJEnhancementRight: true } : candidate)) },
      { type: "discard", cardId: "seven" },
    );
    const declined = gameReducer(pending, { type: "answerDaifugoEffect", activate: false });

    expect(declined.pendingDaifugoEffect).toBeNull();
    expect(declined.players[0].hasJEnhancementRight).toBe(true);
  });

  it("shows enhanced 5 confirmation only for a human holder and preserves the right when declined", () => {
    const withoutRight = gameReducer(stateForDiscard(card("five", 5), daifugoOptions({ fiveSkip: true })), { type: "discard", cardId: "five" });
    const normal = gameReducer(withoutRight, { type: "answerDaifugoEffect", activate: true });
    expect(normal.pendingDaifugoEffect).toBeNull();
    expect(normal.lastDiscarderIndex).toBe(1);
    expect(normal.message).toBe("5スキップにより、手番が飛びます。次はPlayer 3です。");

    const base = stateForDiscard(card("five", 5), daifugoOptions({ fiveSkip: true }));
    const withRight = gameReducer(
      { ...base, players: base.players.map((candidate, index) => (index === 0 ? { ...candidate, hasJEnhancementRight: true } : candidate)) },
      { type: "discard", cardId: "five" },
    );
    const confirming = gameReducer(withRight, { type: "answerDaifugoEffect", activate: true });
    expect(confirming.pendingDaifugoEffect?.kind).toBe("fiveEnhancementConfirm");
    expect(confirming.players[0].hasJEnhancementRight).toBe(true);

    const declined = gameReducer(confirming, { type: "answerFiveEnhancement", useEnhancement: false });
    expect(declined.pendingDaifugoEffect).toBeNull();
    expect(declined.players[0].hasJEnhancementRight).toBe(true);
    expect(declined.lastDiscarderIndex).toBe(1);
    expect(declined.message).toBe("5スキップにより、手番が飛びます。次はPlayer 3です。");
  });

  it("reports normal 5 skip results in the current direction", () => {
    const clockwisePending = gameReducer(stateForFivePlayerDiscard(card("five", 5), "clockwise", daifugoOptions({ fiveSkip: true })), {
      type: "discard",
      cardId: "five",
    });
    const clockwise = gameReducer(clockwisePending, { type: "answerDaifugoEffect", activate: true });
    expect(clockwise.message).toBe("5スキップにより、手番が飛びます。次はPlayer 3です。");

    const reversedPending = gameReducer(stateForFivePlayerDiscard(card("five", 5), "counterclockwise", daifugoOptions({ fiveSkip: true })), {
      type: "discard",
      cardId: "five",
    });
    const reversed = gameReducer(reversedPending, { type: "answerDaifugoEffect", activate: true });
    expect(reversed.message).toBe("5スキップにより、手番が飛びます。次はPlayer 4です。");
  });

  it("calculates enhanced 5 targets in current direction", () => {
    const clockwise = stateForFivePlayerDiscard(card("five", 5), "clockwise");
    expect(getEnhancedFiveTurnOptions(clockwise, 0)).toEqual([
      { playerIndex: 1, skippedPlayerIndexes: [], selectable: false },
      { playerIndex: 2, skippedPlayerIndexes: [1], selectable: true },
      { playerIndex: 3, skippedPlayerIndexes: [1, 2], selectable: true },
      { playerIndex: 4, skippedPlayerIndexes: [1, 2, 3], selectable: true },
    ]);

    const reversed = stateForFivePlayerDiscard(card("five", 5), "counterclockwise");
    expect(getEnhancedFiveTurnOptions(reversed, 0)).toEqual([
      { playerIndex: 4, skippedPlayerIndexes: [], selectable: false },
      { playerIndex: 3, skippedPlayerIndexes: [4], selectable: true },
      { playerIndex: 2, skippedPlayerIndexes: [4, 3], selectable: true },
      { playerIndex: 1, skippedPlayerIndexes: [4, 3, 2], selectable: true },
    ]);
  });

  it("uses enhanced 5 to hand off to a selected clockwise target without double skipping", () => {
    const base = stateForFivePlayerDiscard(card("five", 5), "clockwise", daifugoOptions({ fiveSkip: true }));
    const pending = gameReducer(
      { ...base, players: base.players.map((candidate, index) => (index === 0 ? { ...candidate, hasJEnhancementRight: true } : candidate)) },
      { type: "discard", cardId: "five" },
    );
    const confirming = gameReducer(pending, { type: "answerDaifugoEffect", activate: true });
    const splashing = gameReducer(confirming, { type: "answerFiveEnhancement", useEnhancement: true });
    expect(splashing.pendingDaifugoEffect?.kind).toBe("fiveEnhancementSplash");
    expect(splashing.players[0].hasJEnhancementRight).toBe(true);

    const choosingTarget = gameReducer(splashing, { type: "finishFiveEnhancementSplash" });
    expect(choosingTarget.pendingDaifugoEffect?.kind).toBe("fiveEnhancedTargetSelect");
    expect(choosingTarget.players[0].hasJEnhancementRight).toBe(true);

    const invalidImmediateNext = gameReducer(choosingTarget, { type: "selectEnhancedFiveTarget", targetPlayerIndex: 1 });
    expect(invalidImmediateNext.pendingDaifugoEffect).toEqual(choosingTarget.pendingDaifugoEffect);
    expect(invalidImmediateNext.players[0].hasJEnhancementRight).toBe(true);

    const selected = gameReducer(choosingTarget, { type: "selectEnhancedFiveTarget", targetPlayerIndex: 3 });
    expect(selected.pendingDaifugoEffect).toMatchObject({ kind: "fiveEnhancedTargetSelect", selectedTargetPlayerIndex: 3 });
    expect(selected.players[0].hasJEnhancementRight).toBe(true);

    const resolved = gameReducer(selected, { type: "confirmEnhancedFiveTarget" });
    expect(resolved.players[0].hasJEnhancementRight).toBe(false);
    expect(resolved.lastDiscarderIndex).toBe(2);
    expect(resolved.message).toBe("Player 1がJ強化5スキップを使用し、Player 2、Player 3をスキップしました。次はPlayer 4です。");
    const next = gameReducer(resolved, { type: "confirmHandoff" });
    expect(next.currentPlayerIndex).toBe(3);
  });

  it("uses enhanced 5 in reverse direction and works in three-player games", () => {
    const reversedBase = stateForFivePlayerDiscard(card("five", 5), "counterclockwise", daifugoOptions({ fiveSkip: true }));
    const reversedPending = gameReducer(
      { ...reversedBase, players: reversedBase.players.map((candidate, index) => (index === 0 ? { ...candidate, hasJEnhancementRight: true } : candidate)) },
      { type: "discard", cardId: "five" },
    );
    const reversedConfirming = gameReducer(reversedPending, { type: "answerDaifugoEffect", activate: true });
    const reversedSplashing = gameReducer(reversedConfirming, { type: "answerFiveEnhancement", useEnhancement: true });
    const reversedChoosing = gameReducer(reversedSplashing, { type: "finishFiveEnhancementSplash" });
    const reversedSelected = gameReducer(reversedChoosing, { type: "selectEnhancedFiveTarget", targetPlayerIndex: 2 });
    const reversedResolved = gameReducer(reversedSelected, { type: "confirmEnhancedFiveTarget" });
    expect(reversedResolved.lastDiscarderIndex).toBe(3);
    expect(reversedResolved.message).toBe("Player 1がJ強化5スキップを使用し、Player 5、Player 4をスキップしました。次はPlayer 3です。");
    expect(gameReducer(reversedResolved, { type: "confirmHandoff" }).currentPlayerIndex).toBe(2);

    const threeBase = stateForDiscard(card("five", 5), daifugoOptions({ fiveSkip: true }));
    const threePending = gameReducer(
      { ...threeBase, players: threeBase.players.map((candidate, index) => (index === 0 ? { ...candidate, hasJEnhancementRight: true } : candidate)) },
      { type: "discard", cardId: "five" },
    );
    const threeConfirming = gameReducer(threePending, { type: "answerDaifugoEffect", activate: true });
    const threeSplashing = gameReducer(threeConfirming, { type: "answerFiveEnhancement", useEnhancement: true });
    const threeChoosing = gameReducer(threeSplashing, { type: "finishFiveEnhancementSplash" });
    expect(getEnhancedFiveTurnOptions(threeChoosing, 0).filter((option) => option.selectable).map((option) => option.playerIndex)).toEqual([2]);
    const threeSelected = gameReducer(threeChoosing, { type: "selectEnhancedFiveTarget", targetPlayerIndex: 2 });
    const threeResolved = gameReducer(threeSelected, { type: "confirmEnhancedFiveTarget" });
    expect(threeResolved.players[0].hasJEnhancementRight).toBe(false);
    expect(gameReducer(threeResolved, { type: "confirmHandoff" }).currentPlayerIndex).toBe(2);
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
    expect(resolved.daifugoEffectEvent?.kind).toBe("queenNumberVanish");
    expect(resolved.queenVanishedRanks).toEqual([7]);
    expect(resolved.daifugoEffectEvent?.queenDeckAudit).toMatchObject({
      beforeDeckCount: 3,
      removedFromDeckCount: 1,
      refillDrawCount: 1,
      afterDeckCount: 1,
      expectedAfterDeckCount: 1,
    });
  });

  it("keeps a Q after-effect replacement draw win pending until the Q animation can finish", () => {
    const base = stateForDiscard(card("queen", 12), daifugoOptions({ queenNumberVanish: true }));
    const selecting: GameState = {
      ...base,
      players: [
        {
          ...base.players[0],
          hand: [
            card("1s", 1, "S"),
            card("1h", 1, "H"),
            card("1d", 1, "D"),
            card("2s", 2, "S"),
            card("2h", 2, "H"),
            card("2d", 2, "D"),
            card("3s", 3, "S"),
            card("4s", 4, "S"),
            card("remove-9", 9, "H"),
            card("key", 13, "C"),
          ],
        },
        base.players[1],
        base.players[2],
      ],
      deck: [card("refill-5", 5, "S"), card("pad-6", 6, "H")],
      pendingDaifugoEffect: {
        kind: "queenSelect",
        effect: "queenNumberVanish",
        playerIndex: 0,
        continue: { shouldConfirmReach: false },
      },
      phase: "handoff",
    };

    const resolved = gameReducer(selecting, { type: "selectQueenVanishRank", rank: 9 });

    expect(resolved.phase).toBe("handoff");
    expect(resolved.result).toBeNull();
    expect(resolved.pendingDaifugoEffect).toMatchObject({
      kind: "queenWinConfirm",
      playerIndex: 0,
    });
    expect(resolved.daifugoEffectEvent?.kind).toBe("queenNumberVanish");
    expect(resolved.players[0].winningResult?.canWin).toBe(true);
  });

  it("resolves a Q after-effect win when the queued confirmation is answered", () => {
    const scenario = createDebugDaifugoState("queenAfterEffectWin");
    const pendingWin = gameReducer(scenario, { type: "selectQueenVanishRank", rank: 9 });
    const resolved = gameReducer(pendingWin, { type: "answerQueenWin", takeWin: true });

    expect(resolved.phase).toBe("result");
    expect(resolved.result?.winnerIndex).toBe(0);
    expect(resolved.result?.winType).toBe("tsumo");
    expect(resolved.pendingDaifugoEffect).toBeNull();
  });

  it("continues normally after Q replacement draws when the Q user cannot win", () => {
    const base = stateForDiscard(card("queen", 12), daifugoOptions({ queenNumberVanish: true }));
    const selecting: GameState = {
      ...base,
      players: [{ ...base.players[0], hand: [card("remove-9", 9), card("loose-3", 3), card("loose-8", 8)] }, base.players[1], base.players[2]],
      deck: [card("refill-5", 5, "S"), card("pad-6", 6, "H")],
      pendingDaifugoEffect: {
        kind: "queenSelect",
        effect: "queenNumberVanish",
        playerIndex: 0,
        continue: { shouldConfirmReach: false },
      },
      phase: "handoff",
    };

    const resolved = gameReducer(selecting, { type: "selectQueenVanishRank", rank: 9 });

    expect(resolved.phase).toBe("handoff");
    expect(resolved.result).toBeNull();
    expect(resolved.pendingDaifugoEffect).toBeNull();
  });

  it("does not award an immediate Q after-effect win to non-users", () => {
    const base = stateForDiscard(card("queen", 12), daifugoOptions({ queenNumberVanish: true }));
    const selecting: GameState = {
      ...base,
      players: [
        { ...base.players[0], hand: [card("actor-remove-9", 9), card("actor-loose-3", 3), card("actor-loose-8", 8)] },
        {
          ...base.players[1],
          hand: [
            card("p2-1s", 1, "S"),
            card("p2-1h", 1, "H"),
            card("p2-1d", 1, "D"),
            card("p2-2s", 2, "S"),
            card("p2-2h", 2, "H"),
            card("p2-2d", 2, "D"),
            card("p2-3s", 3, "S"),
            card("p2-4s", 4, "S"),
            card("p2-remove-9", 9, "H"),
            card("p2-key", 13, "C"),
          ],
        },
        base.players[2],
      ],
      deck: [card("refill-5", 5, "S"), card("p2-refill-5", 5, "H"), card("pad-6", 6, "H")],
      pendingDaifugoEffect: {
        kind: "queenSelect",
        effect: "queenNumberVanish",
        playerIndex: 0,
        continue: { shouldConfirmReach: false },
      },
      phase: "handoff",
    };

    const resolved = gameReducer(selecting, { type: "selectQueenVanishRank", rank: 9 });

    expect(resolved.phase).toBe("handoff");
    expect(resolved.result).toBeNull();
    expect(resolved.winner).toBeNull();
  });

  it("can start the DEV scenario for a Q after-effect immediate win without changing normal play", () => {
    const scenario = createDebugDaifugoState("queenAfterEffectWin");
    const normal = stateForDiscard(card("queen", 12), daifugoOptions({ queenNumberVanish: true }));

    expect(scenario.pendingDaifugoEffect).toMatchObject({ kind: "queenSelect", effect: "queenNumberVanish" });
    expect(scenario.message).toContain("Q補充ドローで即上がり");
    expect(normal.pendingDaifugoEffect).toBeNull();
    expect(normal.phase).toBe("discard");
  });

  it("ignores a Q rank that has already been vanished", () => {
    const base = stateForDiscard(card("queen", 12), daifugoOptions({ queenNumberVanish: true }));
    const selecting: GameState = {
      ...base,
      queenVanishedRanks: [7],
      pendingDaifugoEffect: {
        kind: "queenSelect",
        effect: "queenNumberVanish",
        playerIndex: 0,
        continue: { shouldConfirmReach: false },
      },
    };
    const resolved = gameReducer(selecting, { type: "selectQueenVanishRank", rank: 7 });

    expect(resolved).toBe(selecting);
  });

  it("marks Q ranks unavailable when the post-vanish deck cannot refill hands", () => {
    const base = stateForDiscard(card("queen", 12), daifugoOptions({ queenNumberVanish: true }));
    const state: GameState = {
      ...base,
      players: [
        { ...base.players[0], hand: [card("5s", 5), card("5h", 5, "H"), card("9s", 9)] },
        { ...base.players[1], hand: [] },
        { ...base.players[2], hand: [] },
      ],
      deck: [card("deck-5", 5), card("deck-9", 9)],
    };

    const options = getQueenVanishRankOptions(state);
    const five = options.find((option) => option.rank === 5);
    const nine = options.find((option) => option.rank === 9);

    expect(five).toMatchObject({
      removedFromDeck: 1,
      replenishmentRequired: 2,
      availableAfterVanish: 1,
      selectable: false,
    });
    expect(nine?.selectable).toBe(true);
  });

  it("fizzles Q safely when every remaining rank lacks refill cards", () => {
    const base = stateForDiscard(card("queen", 12), daifugoOptions({ queenNumberVanish: true }));
    const pending: GameState = {
      ...base,
      queenVanishedRanks: [1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
      deck: [],
      players: [{ ...base.players[0], hand: [card("2s", 2)] }, base.players[1], base.players[2]],
    };
    const confirmed = gameReducer(
      {
        ...pending,
        pendingDaifugoEffect: {
          kind: "confirm",
          effect: "queenNumberVanish",
          playerIndex: 0,
          continue: { shouldConfirmReach: false },
        },
      },
      { type: "answerDaifugoEffect", activate: true },
    );

    expect(confirmed.pendingDaifugoEffect).toBeNull();
    expect(confirmed.phase).toBe("handoff");
    expect(confirmed.message).toContain("Q効果は発動できませんでした");
  });

  it("includes all cards from unpublished three-card and four-card melds as 7 exchange candidates", () => {
    const threeCardPlayer = player(2, [card("3s", 3, "S"), card("3h", 3, "H"), card("3d", 3, "D"), card("9c", 9, "C")]);
    const fourCardPlayer = player(2, [card("5s", 5, "S"), card("5h", 5, "H"), card("5d", 5, "D"), card("5c", 5, "C"), card("9c", 9, "C")]);

    expect(getSevenExchangeCandidateCards(threeCardPlayer).map((item) => item.id).sort()).toEqual(["3d", "3h", "3s"]);
    expect(getSevenExchangeCandidateCards(fourCardPlayer).map((item) => item.id).sort()).toEqual(["5c", "5d", "5h", "5s"]);
  });

  it("prefers pair cards for 7 exchange when there is no unpublished completed meld", () => {
    const target = player(2, [card("2s", 2, "S"), card("2h", 2, "H"), card("6d", 6, "D"), card("6c", 6, "C"), card("9c", 9, "C")]);

    expect(getSevenExchangeCandidateCards(target).map((item) => item.id).sort()).toEqual(["2h", "2s", "6c", "6d"]);
  });

  it("releases reach after 7 exchange when the hand no longer satisfies reach", () => {
    const base = stateForDiscard(card("seven", 7), daifugoOptions({ sevenExchange: true }));
    const selecting: GameState = {
      ...base,
      players: [
        { ...base.players[0], isReach: true, hand: [card("a-2", 2), card("b-2", 2), card("a-4", 4), card("b-4", 4), card("a-6", 6), card("a-8", 8), card("a-9", 9), card("a-10", 10), card("a-11", 11), card("a-13", 13)] },
        { ...base.players[1], hand: [card("p2-1", 1)] },
        base.players[2],
      ],
      pendingDaifugoEffect: {
        kind: "sevenExchange",
        effect: "sevenExchange",
        playerIndex: 0,
        targetPlayerIndex: 1,
        selections: {},
        continue: { shouldConfirmReach: false },
      },
    };
    const selectedByUser = gameReducer(selecting, { type: "selectSevenExchangeCard", playerIndex: 0, cardId: "a-2" });
    const resolved = gameReducer(selectedByUser, { type: "selectSevenExchangeCard", playerIndex: 1, cardId: "p2-1" });

    expect(resolved.players[0].isReach).toBe(false);
    expect(resolved.daifugoEffectEvent?.reachReleasedPlayerIndexes).toEqual([0]);
  });

  it("releases reach from the 7 exchange target when the exchanged card breaks reach", () => {
    const base = stateForDiscard(card("seven", 7), daifugoOptions({ sevenExchange: true }));
    const selecting: GameState = {
      ...base,
      players: [
        { ...base.players[0], hand: [card("give-a", 1)] },
        {
          ...base.players[1],
          isReach: true,
          hand: [
            card("a-2", 2, "S"),
            card("b-2", 2, "H"),
            card("c-2", 2, "D"),
            card("a-4", 4, "S"),
            card("b-4", 4, "H"),
            card("c-4", 4, "D"),
            card("a-7", 7, "S"),
            card("a-9", 9, "H"),
            card("a-11", 11, "D"),
            card("a-13", 13, "C"),
          ],
        },
        base.players[2],
      ],
      pendingDaifugoEffect: {
        kind: "sevenExchange",
        effect: "sevenExchange",
        playerIndex: 0,
        targetPlayerIndex: 1,
        selections: {},
        continue: { shouldConfirmReach: false },
      },
    };
    const selectedByUser = gameReducer(selecting, { type: "selectSevenExchangeCard", playerIndex: 0, cardId: "give-a" });
    const resolved = gameReducer(selectedByUser, { type: "selectSevenExchangeCard", playerIndex: 1, cardId: "a-2" });

    expect(resolved.players[1].isReach).toBe(false);
    expect(resolved.daifugoEffectEvent?.reachReleasedPlayerIndexes).toEqual([1]);
  });

  it("releases reach after Q changes a reached hand and refill does not restore reach", () => {
    const base = stateForDiscard(card("queen", 12), daifugoOptions({ queenNumberVanish: true }));
    const selecting: GameState = {
      ...base,
      players: [
        { ...base.players[0], hand: [card("queen", 12)] },
        {
          ...base.players[1],
          isReach: true,
          hand: [
            card("2s", 2, "S"),
            card("2h", 2, "H"),
            card("2d", 2, "D"),
            card("4s", 4, "S"),
            card("5h", 5, "H"),
            card("7d", 7, "D"),
            card("8s", 8, "S"),
            card("9h", 9, "H"),
            card("10d", 10, "D"),
            card("13c", 13, "C"),
          ],
        },
        base.players[2],
      ],
      deck: [card("deck-11s", 11, "S"), card("deck-1h", 1, "H"), card("deck-6c", 6, "C")],
      pendingDaifugoEffect: {
        kind: "queenSelect",
        effect: "queenNumberVanish",
        playerIndex: 0,
        continue: { shouldConfirmReach: false },
      },
    };
    const resolved = gameReducer(selecting, { type: "selectQueenVanishRank", rank: 2 });

    expect(resolved.players[1].isReach).toBe(false);
    expect(resolved.daifugoEffectEvent?.reachReleasedPlayerIndexes).toEqual([1]);
  });

  it("asks a human player whether to keep reach after Q changes the hand but reach remains valid", () => {
    const base = stateForDiscard(card("queen", 12), daifugoOptions({ queenNumberVanish: true }));
    const selecting: GameState = {
      ...base,
      players: [
        {
          ...base.players[0],
          isReach: true,
          hand: [
            card("2s", 2, "S"),
            card("2h", 2, "H"),
            card("2d", 2, "D"),
            card("4s", 4, "S"),
            card("4h", 4, "H"),
            card("4d", 4, "D"),
            card("6s", 6, "S"),
            card("6h", 6, "H"),
            card("6d", 6, "D"),
            card("13c", 13, "C"),
          ],
        },
        base.players[1],
        base.players[2],
      ],
      deck: [card("deck-11s", 11, "S"), card("deck-1h", 1, "H")],
      pendingDaifugoEffect: {
        kind: "queenSelect",
        effect: "queenNumberVanish",
        playerIndex: 1,
        continue: { shouldConfirmReach: false },
      },
    };
    const resolved = gameReducer(selecting, { type: "selectQueenVanishRank", rank: 13 });
    const released = gameReducer(resolved, { type: "answerReachContinue", keepReach: false });

    expect(resolved.pendingDaifugoEffect?.kind).toBe("reachContinueConfirm");
    expect(resolved.players[0].isReach).toBe(true);
    expect(released.players[0].isReach).toBe(false);
  });

  it("asks a human player whether to keep reach after 7 exchange changes a still-valid reach hand", () => {
    const base = stateForDiscard(card("seven", 7), daifugoOptions({ sevenExchange: true }));
    const selecting: GameState = {
      ...base,
      players: [
        { ...base.players[0], hand: [card("give-a", 1, "D")] },
        {
          ...base.players[1],
          isReach: true,
          hand: [
            card("1s", 1, "S"),
            card("1h", 1, "H"),
            card("4s", 4, "S"),
            card("4h", 4, "H"),
            card("4d", 4, "D"),
            card("7s", 7, "S"),
            card("7h", 7, "H"),
            card("7d", 7, "D"),
            card("13c", 13, "C"),
            card("9c", 9, "C"),
          ],
        },
        base.players[2],
      ],
      deck: [card("deck-4c", 4, "C")],
      pendingDaifugoEffect: {
        kind: "sevenExchange",
        effect: "sevenExchange",
        playerIndex: 0,
        targetPlayerIndex: 1,
        selections: {},
        continue: { shouldConfirmReach: false },
      },
    };
    const selectedByActor = gameReducer(selecting, { type: "selectSevenExchangeCard", playerIndex: 0, cardId: "give-a" });
    const resolved = gameReducer(selectedByActor, { type: "selectSevenExchangeCard", playerIndex: 1, cardId: "4s" });

    expect(resolved.pendingDaifugoEffect?.kind).toBe("reachContinueConfirm");
    expect(resolved.players[1].isReach).toBe(true);
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

  it("shows a J special effect choice before starting J shield", () => {
    const jackPending = gameReducer(stateForDiscard(card("jack", 11)), { type: "discard", cardId: "jack" });
    const choosing = gameReducer(jackPending, { type: "answerDaifugoEffect", activate: true });

    expect(choosing.pendingDaifugoEffect?.kind).toBe("jackSelect");
    expect(choosing.isJBackActive).toBe(false);

    const selectingShield = gameReducer(choosing, { type: "selectJackSpecialEffect", effect: "jShield" });
    expect(selectingShield.pendingDaifugoEffect).toMatchObject({
      kind: "jackShieldSelect",
      playerIndex: 0,
      selectableRanks: expect.arrayContaining([7]),
    });

    const shielded = gameReducer(selectingShield, { type: "selectJackShieldRank", rank: 7 });
    expect(shielded.isJBackActive).toBe(false);
    expect(shielded.players[0].jShield).toEqual({
      rank: 7,
      cardIds: ["a-7"],
    });
    expect(shielded.pendingDaifugoEffect).toBeNull();
  });

  it("J shield only protects card instances held when it is selected", () => {
    const jackPending = gameReducer(stateForDiscard(card("jack", 11)), { type: "discard", cardId: "jack" });
    const choosing = gameReducer(jackPending, { type: "answerDaifugoEffect", activate: true });
    const selectingShield = gameReducer(choosing, { type: "selectJackSpecialEffect", effect: "jShield" });
    const shielded = gameReducer(selectingShield, { type: "selectJackShieldRank", rank: 7 });

    const withLaterSeven = {
      ...shielded,
      players: replacePlayerForTest(shielded.players, 0, {
        ...shielded.players[0],
        hand: [...shielded.players[0].hand, card("later-7", 7)],
      }),
    };
    expect(withLaterSeven.players[0].jShield).toEqual({
      rank: 7,
      cardIds: ["a-7"],
    });
  });

  it("shows completed run melds as J shield options but hides incomplete runs", () => {
    const target = player(1, [
      card("3s", 3, "S"),
      card("4s", 4, "S"),
      card("5s", 5, "S"),
      card("10h", 10, "H"),
      card("11h", 11, "H"),
    ]);

    expect(getJackShieldRunOptions(target).map((option) => option.label)).toEqual(["345"]);
  });

  it("allows a human player to select a completed run for J shield", () => {
    const base = stateForDiscard(card("jack", 11));
    const choosing: GameState = {
      ...base,
      players: replacePlayerForTest(base.players, 0, {
        ...base.players[0],
        hand: [card("3s", 3, "S"), card("4s", 4, "S"), card("5s", 5, "S"), card("loose", 9, "H")],
      }),
      pendingDaifugoEffect: {
        kind: "jackSelect",
        effect: "jackBack",
        playerIndex: 0,
        continue: { shouldConfirmReach: false },
      },
    };
    const refreshed = gameReducer(choosing, { type: "selectJackSpecialEffect", effect: "jShield" });
    if (refreshed.pendingDaifugoEffect?.kind !== "jackShieldSelect") throw new Error("Expected J shield selection");

    const shielded = gameReducer(refreshed, { type: "selectJackShieldRun", key: refreshed.pendingDaifugoEffect.selectableRuns?.[0]?.key ?? "" });

    expect(shielded.players[0].jShield).toEqual({
      kind: "run",
      ranks: [3, 4, 5],
      label: "345",
      cardIds: ["3s", "4s", "5s"],
    });
  });

  it("prevents normal discard of a shielded card", () => {
    const jackPending = gameReducer(stateForDiscard(card("jack", 11)), { type: "discard", cardId: "jack" });
    const choosing = gameReducer(jackPending, { type: "answerDaifugoEffect", activate: true });
    const selectingShield = gameReducer(choosing, { type: "selectJackSpecialEffect", effect: "jShield" });
    const shielded = gameReducer(selectingShield, { type: "selectJackShieldRank", rank: 7 });
    const discardState: GameState = {
      ...shielded,
      phase: "discard",
      currentPlayerIndex: 0,
      drawnCard: shielded.players[0].hand.find((item) => item.id === "a-7") ?? null,
      pendingDaifugoEffect: null,
    };

    const blocked = gameReducer(discardState, { type: "discard", cardId: "a-7" });

    expect(blocked).toBe(discardState);
  });

  it("keeps shielded cards during Q number vanish and consumes the shield", () => {
    const base = stateForDiscard(card("queen", 12), daifugoOptions({ queenNumberVanish: true }));
    const selecting: GameState = {
      ...base,
      players: [
        {
          ...base.players[0],
          hand: [card("self-5", 5), card("self-6", 6)],
          jShield: { rank: 5, cardIds: ["self-5"] },
        },
        { ...base.players[1], hand: [card("target-5", 5)] },
        base.players[2],
      ],
      deck: [card("draw-a", 1), card("draw-b", 2)],
      pendingDaifugoEffect: {
        kind: "queenSelect",
        effect: "queenNumberVanish",
        playerIndex: 0,
        continue: { shouldConfirmReach: false },
      },
    };

    const resolved = gameReducer(selecting, { type: "selectQueenVanishRank", rank: 5 });

    expect(resolved.players[0].hand.some((item) => item.id === "self-5")).toBe(true);
    expect(resolved.players[0].jShield).toBeUndefined();
    expect(resolved.players[1].hand.some((item) => item.id === "target-5")).toBe(false);
    expect(resolved.players[1].discardPile.some((item) => item.id === "target-5")).toBe(true);
  });

  it("keeps only the attacked card during Q number vanish and partially consumes a run J shield", () => {
    const base = stateForDiscard(card("queen", 12), daifugoOptions({ queenNumberVanish: true }));
    const selecting: GameState = {
      ...base,
      players: [
        {
          ...base.players[0],
          hand: [card("3s", 3, "S"), card("4s", 4, "S"), card("5s", 5, "S")],
          jShield: { kind: "run", ranks: [3, 4, 5], label: "345", cardIds: ["3s", "4s", "5s"] },
        },
        { ...base.players[1], hand: [card("target-4", 4)] },
        base.players[2],
      ],
      deck: [card("draw-a", 1), card("draw-b", 2)],
      pendingDaifugoEffect: {
        kind: "queenSelect",
        effect: "queenNumberVanish",
        playerIndex: 1,
        continue: { shouldConfirmReach: false },
      },
    };

    const resolved = gameReducer(selecting, { type: "selectQueenVanishRank", rank: 4 });

    expect(resolved.players[0].hand.some((item) => item.id === "4s")).toBe(true);
    expect(resolved.players[0].jShield?.cardIds.sort()).toEqual(["3s", "5s"]);
    expect(resolved.players[1].hand.some((item) => item.id === "target-4")).toBe(false);
  });

  it("uses run-shielded cards in winning checks", () => {
    const base = stateForDiscard(card("x", 9));
    const winningState: GameState = {
      ...base,
      phase: "discard",
      players: [
        {
          ...base.players[0],
          hand: [
            card("3s", 3, "S"),
            card("4s", 4, "S"),
            card("5s", 5, "S"),
            card("7a", 7, "S"),
            card("7b", 7, "H"),
            card("7c", 7, "D"),
            card("9a", 9, "S"),
            card("9b", 9, "H"),
            card("9c", 9, "D"),
            card("key", 13, "C"),
            card("discard-me", 6, "C"),
          ],
          jShield: { kind: "run", ranks: [3, 4, 5], label: "345", cardIds: ["3s", "4s"] },
        },
        base.players[1],
        base.players[2],
      ],
      drawnCard: card("key", 13, "C"),
    };

    const resolved = gameReducer(winningState, { type: "winWithDiscard", discardCardId: "discard-me" });

    expect(resolved.phase).toBe("result");
    expect(resolved.result?.winningResult.melds.some((meld) => meld.map((item) => item.id).sort().join("|") === "3s|4s|5s")).toBe(true);
  });

  it("uses a decoy card when 7 exchange selects a shielded card", () => {
    const base = stateForDiscard(card("seven", 7), daifugoOptions({ sevenExchange: true }));
    const selecting: GameState = {
      ...base,
      players: [
        {
          ...base.players[0],
          hand: [card("protected-9", 9), card("decoy-4", 4)],
          jShield: { rank: 9, cardIds: ["protected-9"] },
        },
        { ...base.players[1], hand: [card("target-card", 2)] },
        base.players[2],
      ],
      pendingDaifugoEffect: {
        kind: "sevenExchange",
        effect: "sevenExchange",
        playerIndex: 0,
        targetPlayerIndex: 1,
        selections: { 0: "protected-9" },
        continue: { shouldConfirmReach: false },
      },
    };

    const resolved = gameReducer(selecting, { type: "selectSevenExchangeCard", playerIndex: 1, cardId: "target-card" });

    expect(resolved.players[0].hand.some((item) => item.id === "protected-9")).toBe(true);
    expect(resolved.players[0].hand.some((item) => item.id === "target-card")).toBe(true);
    expect(resolved.players[0].jShield).toBeUndefined();
    expect(resolved.players[1].hand.some((item) => item.id === "decoy-4")).toBe(true);
    expect(resolved.players[1].hand.some((item) => item.id === "protected-9")).toBe(false);
  });

  it("excludes run-shielded cards from 7 exchange candidates", () => {
    const target = player(1, [
      card("3s", 3, "S"),
      card("4s", 4, "S"),
      card("5s", 5, "S"),
      card("loose", 9, "H"),
    ]);
    const shielded = { ...target, jShield: { kind: "run" as const, ranks: [3, 4, 5], label: "345", cardIds: ["3s", "4s", "5s"] } };

    expect(getSevenExchangeCandidateCards(shielded).map((item) => item.id)).toEqual(["loose"]);
  });

  it("does not start J shield when J special effect is declined or information browsing is selected", () => {
    const jackPending = gameReducer(stateForDiscard(card("jack", 11)), { type: "discard", cardId: "jack" });
    const declined = gameReducer(jackPending, { type: "answerDaifugoEffect", activate: false });
    expect(declined.players[0].jShield).toBeUndefined();

    const choosing = gameReducer(jackPending, { type: "answerDaifugoEffect", activate: true });
    const inspecting = gameReducer(choosing, { type: "selectJackSpecialEffect", effect: "inspectHands" });
    expect(inspecting.players[0].jShield).toBeUndefined();
    expect(inspecting.pendingDaifugoEffect?.kind).toBe("jackInspect");
  });

  it("grants a single 5/7 enhancement right without changing unrelated J state", () => {
    const choosing = gameReducer(gameReducer(stateForDiscard(card("jack", 11)), { type: "discard", cardId: "jack" }), {
      type: "answerDaifugoEffect",
      activate: true,
    });
    const originalHands = choosing.players.map((candidate) => candidate.hand.map((item) => item.id));
    const originalDeck = choosing.deck.map((item) => item.id);
    const originalDiscardPiles = choosing.players.map((candidate) => candidate.discardPile.map((item) => item.id));
    const resolved = gameReducer(choosing, { type: "selectJackSpecialEffect", effect: "enhanceFiveOrSeven" });

    expect(resolved.players[0].hasJEnhancementRight).toBe(true);
    expect(resolved.players[1].hasJEnhancementRight).toBeFalsy();
    expect(resolved.players[2].hasJEnhancementRight).toBeFalsy();
    expect(resolved.isJBackActive).toBe(false);
    expect(resolved.pendingDaifugoEffect).toBeNull();
    expect(resolved.players.map((candidate) => candidate.hand.map((item) => item.id))).toEqual(originalHands);
    expect(resolved.deck.map((item) => item.id)).toEqual(originalDeck);
    expect(resolved.players.map((candidate) => candidate.discardPile.map((item) => item.id))).toEqual(originalDiscardPiles);
    expect(resolved.players.map((candidate) => candidate.isReach)).toEqual(choosing.players.map((candidate) => candidate.isReach));
    expect(resolved.direction).toBe(choosing.direction);
    expect(resolved.queenVanishedRanks).toEqual(choosing.queenVanishedRanks);
  });

  it("does not complete or stack enhancement rights when already held", () => {
    const choosing = gameReducer(
      gameReducer(
        {
          ...stateForDiscard(card("jack", 11)),
          players: stateForDiscard(card("jack", 11)).players.map((candidate, index) =>
            index === 0 ? { ...candidate, hasJEnhancementRight: true } : candidate,
          ),
        },
        { type: "discard", cardId: "jack" },
      ),
      { type: "answerDaifugoEffect", activate: true },
    );
    const blocked = gameReducer(choosing, { type: "selectJackSpecialEffect", effect: "enhanceFiveOrSeven" });

    expect(blocked).toBe(choosing);
    expect(blocked.pendingDaifugoEffect?.kind).toBe("jackSelect");

    const inspecting = gameReducer(choosing, { type: "selectJackSpecialEffect", effect: "inspectHands" });
    expect(inspecting.pendingDaifugoEffect?.kind).toBe("jackInspect");
  });

  it("offers enhanced 5 while keeping enhanced 7 available", () => {
    const fivePending = gameReducer(
      {
        ...stateForDiscard(card("five", 5), daifugoOptions({ fiveSkip: true, sevenExchange: true })),
        players: stateForDiscard(card("five", 5)).players.map((candidate, index) =>
          index === 0 ? { ...candidate, hasJEnhancementRight: true } : candidate,
        ),
      },
      { type: "discard", cardId: "five" },
    );
    const fiveResolved = gameReducer(fivePending, { type: "answerDaifugoEffect", activate: true });
    expect(fiveResolved.players[0].hasJEnhancementRight).toBe(true);
    expect(fiveResolved.pendingDaifugoEffect?.kind).toBe("fiveEnhancementConfirm");

    const sevenPending = gameReducer(
      {
        ...stateForDiscard(card("seven", 7), daifugoOptions({ fiveSkip: true, sevenExchange: true })),
        players: stateForDiscard(card("seven", 7)).players.map((candidate, index) =>
          index === 0 ? { ...candidate, hasJEnhancementRight: true } : candidate,
        ),
      },
      { type: "discard", cardId: "seven" },
    );
    const sevenResolved = gameReducer(sevenPending, { type: "answerDaifugoEffect", activate: true });
    expect(sevenResolved.players[0].hasJEnhancementRight).toBe(true);
    expect(sevenResolved.pendingDaifugoEffect?.kind).toBe("sevenEnhancementConfirm");
  });

  it("information browsing targets every opponent once and does not alter card state", () => {
    const choosing = gameReducer(gameReducer(stateForDiscard(card("jack", 11)), { type: "discard", cardId: "jack" }), {
      type: "answerDaifugoEffect",
      activate: true,
    });
    const beforeInspect = gameReducer(choosing, { type: "selectJackSpecialEffect", effect: "inspectHands" });
    const originalHands = beforeInspect.players.map((candidate) => candidate.hand.map((item) => item.id));
    const originalDeckIds = beforeInspect.deck.map((item) => item.id);
    expect(beforeInspect.pendingDaifugoEffect?.kind).toBe("jackInspect");
    if (beforeInspect.pendingDaifugoEffect?.kind !== "jackInspect") throw new Error("Expected jackInspect");
    expect(beforeInspect.pendingDaifugoEffect.targetPlayerIndexes).toEqual([1, 2]);

    const firstTarget = beforeInspect.pendingDaifugoEffect.targetPlayerIndexes[0];
    const afterFirstReveal = gameReducer(beforeInspect, {
      type: "inspectJackCard",
      targetPlayerIndex: firstTarget,
      cardId: beforeInspect.players[firstTarget].hand[0].id,
    });
    const blockedSecondReveal = gameReducer(afterFirstReveal, {
      type: "inspectJackCard",
      targetPlayerIndex: firstTarget,
      cardId: beforeInspect.players[firstTarget].hand[1]?.id ?? beforeInspect.players[firstTarget].hand[0].id,
    });
    expect(blockedSecondReveal).toBe(afterFirstReveal);

    const secondStep = gameReducer(afterFirstReveal, { type: "confirmJackInspectCard" });
    expect(secondStep.pendingDaifugoEffect?.kind).toBe("jackInspect");
    if (secondStep.pendingDaifugoEffect?.kind !== "jackInspect") throw new Error("Expected second jackInspect step");
    const secondTarget = secondStep.pendingDaifugoEffect.targetPlayerIndexes[secondStep.pendingDaifugoEffect.currentTargetOffset];
    const afterSecondReveal = gameReducer(secondStep, {
      type: "inspectJackCard",
      targetPlayerIndex: secondTarget,
      cardId: secondStep.players[secondTarget].hand[0].id,
    });
    const resolved = gameReducer(afterSecondReveal, { type: "confirmJackInspectCard" });

    expect(resolved.pendingDaifugoEffect).toBeNull();
    expect(resolved.players.map((candidate) => candidate.hand.map((item) => item.id))).toEqual(originalHands);
    expect(resolved.deck.map((item) => item.id)).toEqual(originalDeckIds);
    expect(resolved.isJBackActive).toBe(false);
    expect(resolved.direction).toBe(beforeInspect.direction);
    expect(resolved.queenVanishedRanks).toEqual(beforeInspect.queenVanishedRanks);
  });

  it("standard CPU J activation does not choose J shield", () => {
    const cpuState = {
      ...stateForDiscard(card("jack", 11)),
      players: stateForDiscard(card("jack", 11)).players.map((candidate, index) =>
        index === 0 ? { ...candidate, isCpu: true, type: "cpu" as const, cpuModelId: "standard" as const } : candidate,
      ),
    };
    const jackPending = gameReducer(cpuState, { type: "discard", cardId: "jack" });
    const resolved = gameReducer(jackPending, { type: "answerDaifugoEffect", activate: true });

    expect(resolved.pendingDaifugoEffect).toBeNull();
    expect(resolved.players[0].jShield).toBeUndefined();
    expect(resolved.isJBackActive).toBe(false);
  });

  it("normal tactical CPU J activation gains an enhancement right instead of toggling J-back", () => {
    const base = stateForDiscard(card("jack", 11));
    const cpuState = {
      ...base,
      players: base.players.map((candidate, index) =>
        index === 0 ? { ...candidate, isCpu: true, type: "cpu" as const, cpuModelId: "tactical" as const } : candidate,
      ),
    };
    const jackPending = gameReducer(cpuState, { type: "discard", cardId: "jack" });
    const resolved = gameReducer(jackPending, { type: "answerDaifugoEffect", activate: true });

    expect(resolved.pendingDaifugoEffect).toBeNull();
    expect(resolved.players[0].hasJEnhancementRight).toBe(true);
    expect(resolved.isJBackActive).toBe(false);
  });

  it("normal tactical CPU with an enhancement right completes J information browsing without interactive pending state", () => {
    const base = stateForDiscard(card("jack", 11));
    const cpuState = {
      ...base,
      players: base.players.map((candidate, index) =>
        index === 0
          ? { ...candidate, isCpu: true, type: "cpu" as const, cpuModelId: "tactical" as const, hasJEnhancementRight: true }
          : candidate,
      ),
    };
    const originalHands = cpuState.players.map((candidate) => candidate.hand.map((item) => item.id));
    const jackPending = gameReducer(cpuState, { type: "discard", cardId: "jack" });
    const resolved = gameReducer(jackPending, { type: "answerDaifugoEffect", activate: true });

    expect(resolved.pendingDaifugoEffect).toBeNull();
    expect(resolved.players[0].hasJEnhancementRight).toBe(true);
    expect(resolved.players.map((candidate) => candidate.hand.map((item) => item.id).sort())).toEqual(
      originalHands.map((hand, index) => (index === 0 ? hand.filter((id) => id !== "jack") : hand).sort()),
    );
    expect(resolved.isJBackActive).toBe(false);
  });

  it("tactical CPU uses J information browsing while the next player is in reach", () => {
    const base = stateForDiscard(card("jack", 11));
    const cpuState = {
      ...base,
      players: base.players.map((candidate, index) => {
        if (index === 0) return { ...candidate, isCpu: true, type: "cpu" as const, cpuModelId: "tactical" as const };
        return index === 1 ? { ...candidate, isReach: true } : candidate;
      }),
    };
    const jackPending = gameReducer(cpuState, { type: "discard", cardId: "jack" });
    const resolved = gameReducer(jackPending, { type: "answerDaifugoEffect", activate: true });

    expect(resolved.pendingDaifugoEffect).toBeNull();
    expect(resolved.players[0].hasJEnhancementRight).toBeFalsy();
    expect(resolved.isJBackActive).toBe(false);
    expect(resolved.message).toContain("情報閲覧が完了しました。");
  });

  it("tactical CPU gains a J enhancement right while a remote player is in reach", () => {
    const base = stateForDiscard(card("jack", 11));
    const cpuState = {
      ...base,
      players: base.players.map((candidate, index) => {
        if (index === 0) return { ...candidate, isCpu: true, type: "cpu" as const, cpuModelId: "tactical" as const };
        return index === 2 ? { ...candidate, isReach: true } : candidate;
      }),
    };
    const jackPending = gameReducer(cpuState, { type: "discard", cardId: "jack" });
    const resolved = gameReducer(jackPending, { type: "answerDaifugoEffect", activate: true });

    expect(resolved.pendingDaifugoEffect).toBeNull();
    expect(resolved.players[0].hasJEnhancementRight).toBe(true);
    expect(resolved.isJBackActive).toBe(false);
  });

  it("tactical CPU uses J information browsing while a remote player is in reach and the enhancement right is already held", () => {
    const base = stateForDiscard(card("jack", 11));
    const cpuState = {
      ...base,
      players: base.players.map((candidate, index) => {
        if (index === 0) {
          return {
            ...candidate,
            isCpu: true,
            type: "cpu" as const,
            cpuModelId: "tactical" as const,
            hasJEnhancementRight: true,
          };
        }
        return index === 2 ? { ...candidate, isReach: true } : candidate;
      }),
    };
    const jackPending = gameReducer(cpuState, { type: "discard", cardId: "jack" });
    const resolved = gameReducer(jackPending, { type: "answerDaifugoEffect", activate: true });

    expect(resolved.pendingDaifugoEffect).toBeNull();
    expect(resolved.players[0].hasJEnhancementRight).toBe(true);
    expect(resolved.isJBackActive).toBe(false);
    expect(resolved.message).toContain("情報閲覧が完了しました。");
  });

  it("junior and standard CPU always use J information browsing after J-back removal", () => {
    for (const cpuModelId of ["easy", "standard"] as const) {
      const base = stateForDiscard(card("jack", 11));
      const cpuState = {
        ...base,
        players: base.players.map((candidate, index) =>
          index === 0
            ? {
                ...candidate,
                isCpu: true,
                type: "cpu" as const,
                cpuModelId,
                hand: [card("jack", 11), card("q1", 12), card("q2", 12, "H"), card("q3", 12, "D")],
              }
            : candidate,
        ),
      };
      const jackPending = gameReducer(cpuState, { type: "discard", cardId: "jack" });
      const resolved = gameReducer(jackPending, { type: "answerDaifugoEffect", activate: true });

      expect(resolved.pendingDaifugoEffect).toBeNull();
      expect(resolved.players[0].hasJEnhancementRight).toBeFalsy();
      expect(resolved.players[0].jShield).toBeUndefined();
      expect(resolved.message).toContain("情報閲覧が完了しました。");
    }
  });

  it("master CPU uses J shield in normal play before taking a J enhancement right when a shield target exists", () => {
    const base = stateForDiscard(card("jack", 11));
    const cpuState = {
      ...base,
      players: base.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              isCpu: true,
              type: "cpu" as const,
              cpuModelId: "master" as const,
              hand: [card("jack", 11), card("k1", 13), card("k2", 13, "H"), card("k3", 13, "D")],
            }
          : candidate,
      ),
    };
    const jackPending = gameReducer(cpuState, { type: "discard", cardId: "jack" });
    const resolved = gameReducer(jackPending, { type: "answerDaifugoEffect", activate: true });

    expect(resolved.players[0].hasJEnhancementRight).toBeFalsy();
    expect(resolved.players[0].jShield).toEqual({ rank: 13, cardIds: ["k1", "k2", "k3"] });
  });

  it("master CPU takes a J enhancement right in normal play when both 5 and 7 are held", () => {
    const base = stateForDiscard(card("jack", 11));
    const cpuState = {
      ...base,
      players: base.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              isCpu: true,
              type: "cpu" as const,
              cpuModelId: "master" as const,
              hand: [
                card("jack", 11),
                card("q1", 12),
                card("q2", 12, "H"),
                card("q3", 12, "D"),
                card("five", 5),
                card("seven", 7),
              ],
            }
          : candidate,
      ),
    };
    const jackPending = gameReducer(cpuState, { type: "discard", cardId: "jack" });
    const resolved = gameReducer(jackPending, { type: "answerDaifugoEffect", activate: true });

    expect(resolved.players[0].jShield).toBeUndefined();
    expect(resolved.players[0].hasJEnhancementRight).toBe(true);
  });

  it("master CPU uses J shield in normal play when only 5 is held", () => {
    const base = stateForDiscard(card("jack", 11));
    const cpuState = {
      ...base,
      players: base.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              isCpu: true,
              type: "cpu" as const,
              cpuModelId: "master" as const,
              hand: [card("jack", 11), card("q1", 12), card("q2", 12, "H"), card("q3", 12, "D"), card("five", 5)],
            }
          : candidate,
      ),
    };
    const jackPending = gameReducer(cpuState, { type: "discard", cardId: "jack" });
    const resolved = gameReducer(jackPending, { type: "answerDaifugoEffect", activate: true });

    expect(resolved.players[0].jShield).toEqual({ rank: 12, cardIds: ["q1", "q2", "q3"] });
    expect(resolved.players[0].hasJEnhancementRight).toBeFalsy();
  });

  it("master CPU uses J shield in normal play when only 7 is held", () => {
    const base = stateForDiscard(card("jack", 11));
    const cpuState = {
      ...base,
      players: base.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              isCpu: true,
              type: "cpu" as const,
              cpuModelId: "master" as const,
              hand: [card("jack", 11), card("q1", 12), card("q2", 12, "H"), card("q3", 12, "D"), card("seven", 7)],
            }
          : candidate,
      ),
    };
    const jackPending = gameReducer(cpuState, { type: "discard", cardId: "jack" });
    const resolved = gameReducer(jackPending, { type: "answerDaifugoEffect", activate: true });

    expect(resolved.players[0].jShield).toEqual({ rank: 12, cardIds: ["q1", "q2", "q3"] });
    expect(resolved.players[0].hasJEnhancementRight).toBeFalsy();
  });

  it("master CPU uses J shield in normal play when enhancement is already active and picks the highest priority triple", () => {
    const base = stateForDiscard(card("jack", 11));
    const cpuState = {
      ...base,
      queenVanishedRanks: [5, 7],
      players: base.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              isCpu: true,
              type: "cpu" as const,
              cpuModelId: "master" as const,
              hasJEnhancementRight: true,
              hand: [card("jack", 11), card("k1", 13), card("k2", 13, "H"), card("k3", 13, "D")],
            }
          : candidate,
      ),
    };
    const jackPending = gameReducer(cpuState, { type: "discard", cardId: "jack" });
    const resolved = gameReducer(jackPending, { type: "answerDaifugoEffect", activate: true });

    expect(resolved.players[0].jShield).toEqual({ rank: 13, cardIds: ["k1", "k2", "k3"] });
  });

  it("master CPU prioritizes completed runs over same-rank melds for J shield", () => {
    const base = stateForDiscard(card("jack", 11));
    const cpuState = {
      ...base,
      players: base.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              isCpu: true,
              type: "cpu" as const,
              cpuModelId: "master" as const,
              hasJEnhancementRight: true,
              hand: [
                card("jack", 11),
                card("k1", 13),
                card("k2", 13, "H"),
                card("k3", 13, "D"),
                card("7s", 7, "S"),
                card("8s", 8, "S"),
                card("9s", 9, "S"),
              ],
            }
          : candidate,
      ),
    };
    const jackPending = gameReducer(cpuState, { type: "discard", cardId: "jack" });
    const resolved = gameReducer(jackPending, { type: "answerDaifugoEffect", activate: true });

    expect(resolved.players[0].jShield).toEqual({ kind: "run", ranks: [7, 8, 9], label: "789", cardIds: ["7s", "8s", "9s"] });
  });

  it("master CPU does not use J shield when spending J would break a protected run", () => {
    const base = stateForDiscard(card("jack", 11));
    const cpuState = {
      ...base,
      players: base.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              isCpu: true,
              type: "cpu" as const,
              cpuModelId: "master" as const,
              hand: [card("jack", 11), card("10s", 10, "S"), card("js", 11, "S"), card("qs", 12, "S")],
            }
          : candidate,
      ),
    };
    const jackPending = gameReducer(cpuState, { type: "discard", cardId: "jack" });
    const resolved = gameReducer(jackPending, { type: "answerDaifugoEffect", activate: true });

    expect(resolved.players[0].jShield).toBeUndefined();
    expect(resolved.message).toContain("情報閲覧が完了しました。");
  });

  it("master CPU does not use another J shield while a run shield is already active", () => {
    const base = stateForDiscard(card("jack", 11));
    const cpuState = {
      ...base,
      players: base.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              isCpu: true,
              type: "cpu" as const,
              cpuModelId: "master" as const,
              hasJEnhancementRight: true,
              jShield: { kind: "run" as const, ranks: [3, 4, 5], label: "345", cardIds: ["old-3", "old-4", "old-5"] },
              hand: [card("jack", 11), card("q1", 12), card("q2", 12, "H"), card("q3", 12, "D")],
            }
          : candidate,
      ),
    };
    const jackPending = gameReducer(cpuState, { type: "discard", cardId: "jack" });
    const resolved = gameReducer(jackPending, { type: "answerDaifugoEffect", activate: true });

    expect(resolved.players[0].jShield).toEqual(cpuState.players[0].jShield);
    expect(resolved.message).toContain("情報閲覧が完了しました。");
  });

  it("master CPU does not use J shield when both 7 and Q have vanished", () => {
    const base = stateForDiscard(card("jack", 11));
    const cpuState = {
      ...base,
      queenVanishedRanks: [7, 12],
      players: base.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              isCpu: true,
              type: "cpu" as const,
              cpuModelId: "master" as const,
              hasJEnhancementRight: true,
              hand: [card("jack", 11), card("3s", 3, "S"), card("4s", 4, "S"), card("5s", 5, "S")],
            }
          : candidate,
      ),
    };
    const jackPending = gameReducer(cpuState, { type: "discard", cardId: "jack" });
    const resolved = gameReducer(jackPending, { type: "answerDaifugoEffect", activate: true });

    expect(resolved.players[0].jShield).toBeUndefined();
  });

  it("master CPU uses information browsing for adjacent reach when Q is available and 5/7 are unavailable", () => {
    const base = stateForDiscard(card("jack", 11));
    const cpuState = {
      ...base,
      players: base.players.map((candidate, index) => {
        if (index === 0) {
          return {
            ...candidate,
            isCpu: true,
            type: "cpu" as const,
            cpuModelId: "master" as const,
            hand: [card("jack", 11), card("q1", 12), card("q2", 12, "H"), card("q3", 12, "D")],
          };
        }
        return index === 1 ? { ...candidate, isReach: true } : candidate;
      }),
    };
    const jackPending = gameReducer(cpuState, { type: "discard", cardId: "jack" });
    const resolved = gameReducer(jackPending, { type: "answerDaifugoEffect", activate: true });

    expect(resolved.players[0].jShield).toBeUndefined();
    expect(resolved.players[0].hasJEnhancementRight).toBeFalsy();
    expect(resolved.message).toContain("情報閲覧が完了しました。");
  });

  it("master CPU treats the next player in the current direction as adjacent for J shield decisions", () => {
    const base = stateForDiscard(card("jack", 11));
    const cpuState = {
      ...base,
      direction: "counterclockwise" as const,
      players: base.players.map((candidate, index) => {
        if (index === 0) {
          return {
            ...candidate,
            isCpu: true,
            type: "cpu" as const,
            cpuModelId: "master" as const,
            hand: [card("jack", 11), card("a1", 1), card("a2", 1, "H"), card("a3", 1, "D")],
          };
        }
        return index === 2
          ? { ...candidate, openMelds: [[card("two-call-1", 1)], [card("two-call-2", 2)]] }
          : candidate;
      }),
      queenVanishedRanks: [5, 7],
    };
    const jackPending = gameReducer(cpuState, { type: "discard", cardId: "jack" });
    const resolved = gameReducer(jackPending, { type: "answerDaifugoEffect", activate: true });

    expect(resolved.players[0].jShield).toEqual({ rank: 1, cardIds: ["a1", "a2", "a3"] });
    expect(resolved.players[0].hasJEnhancementRight).toBeFalsy();
  });

  it("master CPU falls back to information browsing when self is two-call or no same-rank triple remains", () => {
    const cases = [
      {
        playerPatch: {
          openMelds: [[card("open-1", 1)], [card("open-2", 2)]],
          hand: [card("jack", 11), card("q1", 12), card("q2", 12, "H"), card("q3", 12, "D")],
        },
      },
      {
        playerPatch: {
          hand: [card("jack", 11), card("j2", 11, "H"), card("j3", 11, "D"), card("k1", 13), card("k2", 13, "H")],
        },
      },
    ];

    for (const { playerPatch } of cases) {
      const base = stateForDiscard(card("jack", 11));
      const cpuState = {
        ...base,
        players: base.players.map((candidate, index) =>
          index === 0
            ? {
                ...candidate,
                ...playerPatch,
                isCpu: true,
                type: "cpu" as const,
                cpuModelId: "master" as const,
                hasJEnhancementRight: true,
              }
            : candidate,
        ),
      };
      const jackPending = gameReducer(cpuState, { type: "discard", cardId: "jack" });
      const resolved = gameReducer(jackPending, { type: "answerDaifugoEffect", activate: true });

      expect(resolved.players[0].jShield).toBeUndefined();
      expect(resolved.message).toContain("情報閲覧が完了しました。");
    }
  });

  it("tactical CPU automatically uses enhanced 5 to skip a remote reach player", () => {
    const base = stateForFivePlayerDiscard(card("five", 5), "clockwise", daifugoOptions({ fiveSkip: true }));
    const cpuState = {
      ...base,
      players: base.players.map((candidate, index) => {
        if (index === 0) {
          return {
            ...candidate,
            isCpu: true,
            type: "cpu" as const,
            cpuModelId: "tactical" as const,
            hasJEnhancementRight: true,
          };
        }
        return index === 2 ? { ...candidate, isReach: true } : candidate;
      }),
    };
    const fivePending = gameReducer(cpuState, { type: "discard", cardId: "five" });
    const resolved = gameReducer(fivePending, { type: "answerDaifugoEffect", activate: true });
    const next = gameReducer(resolved, { type: "confirmHandoff" });

    expect(resolved.players[0].hasJEnhancementRight).toBe(false);
    expect(resolved.lastDiscarderIndex).toBe(2);
    expect(next.currentPlayerIndex).toBe(3);
  });

  it("tactical CPU automatically starts enhanced 7 with a remote reach player", () => {
    const base = stateForDiscard(card("seven", 7), daifugoOptions({ sevenExchange: true }));
    const cpuState = {
      ...base,
      players: base.players.map((candidate, index) => {
        if (index === 0) {
          return {
            ...candidate,
            isCpu: true,
            type: "cpu" as const,
            cpuModelId: "tactical" as const,
            hasJEnhancementRight: true,
          };
        }
        return index === 1 ? candidate : { ...candidate, isReach: true };
      }),
    };
    const sevenPending = gameReducer(cpuState, { type: "discard", cardId: "seven" });
    const exchange = gameReducer(sevenPending, { type: "answerDaifugoEffect", activate: true });

    expect(exchange.pendingDaifugoEffect).toMatchObject({
      kind: "sevenExchange",
      playerIndex: 0,
      targetPlayerIndex: 2,
      consumeJEnhancementRightOnComplete: true,
    });
    expect(exchange.players[0].hasJEnhancementRight).toBe(true);
  });

  it("tactical CPU automatically uses enhanced 5 to skip a remote two-call player", () => {
    const base = stateForFivePlayerDiscard(card("five", 5), "clockwise", daifugoOptions({ fiveSkip: true }));
    const cpuState = {
      ...base,
      players: base.players.map((candidate, index) => {
        if (index === 0) {
          return {
            ...candidate,
            isCpu: true,
            type: "cpu" as const,
            cpuModelId: "tactical" as const,
            hasJEnhancementRight: true,
          };
        }
        return index === 2
          ? { ...candidate, openMelds: [[card("two-call-1", 1)], [card("two-call-2", 2)]] }
          : candidate;
      }),
    };
    const fivePending = gameReducer(cpuState, { type: "discard", cardId: "five" });
    const resolved = gameReducer(fivePending, { type: "answerDaifugoEffect", activate: true });
    const next = gameReducer(resolved, { type: "confirmHandoff" });

    expect(resolved.players[0].hasJEnhancementRight).toBe(false);
    expect(resolved.lastDiscarderIndex).toBe(2);
    expect(next.currentPlayerIndex).toBe(3);
  });

  it("tactical CPU automatically starts enhanced 7 with a remote two-call player", () => {
    const base = stateForDiscard(card("seven", 7), daifugoOptions({ sevenExchange: true }));
    const cpuState = {
      ...base,
      players: base.players.map((candidate, index) => {
        if (index === 0) {
          return {
            ...candidate,
            isCpu: true,
            type: "cpu" as const,
            cpuModelId: "tactical" as const,
            hasJEnhancementRight: true,
          };
        }
        return index === 2
          ? { ...candidate, openMelds: [[card("two-call-1", 1)], [card("two-call-2", 2)]] }
          : candidate;
      }),
    };
    const sevenPending = gameReducer(cpuState, { type: "discard", cardId: "seven" });
    const exchange = gameReducer(sevenPending, { type: "answerDaifugoEffect", activate: true });

    expect(exchange.pendingDaifugoEffect).toMatchObject({
      kind: "sevenExchange",
      playerIndex: 0,
      targetPlayerIndex: 2,
      consumeJEnhancementRightOnComplete: true,
    });
    expect(exchange.players[0].hasJEnhancementRight).toBe(true);
  });

  it("tactical CPU enhanced 7 targets the active threat mode for every seat, direction, and player count", () => {
    for (const playerCount of [3, 4, 5]) {
      for (let currentPlayerIndex = 0; currentPlayerIndex < playerCount; currentPlayerIndex += 1) {
        for (const direction of ["clockwise", "counterclockwise"] satisfies GameState["direction"][]) {
          for (const threat of ["reach", "two-call"] as const) {
            const { state, targetPlayerIndex } = stateForTacticalSevenThreat(playerCount, currentPlayerIndex, direction, threat);
            const sevenPending = gameReducer(state, { type: "discard", cardId: "seven" });
            const exchange = gameReducer(sevenPending, { type: "answerDaifugoEffect", activate: true });

            expect(exchange.pendingDaifugoEffect, `${playerCount}/${currentPlayerIndex}/${direction}/${threat}`).toMatchObject({
              kind: "sevenExchange",
              playerIndex: currentPlayerIndex,
              targetPlayerIndex,
              consumeJEnhancementRightOnComplete: true,
            });
          }
        }
      }
    }
  });

  it("tactical CPU normal 7 targets an adjacent threat for every seat, direction, and player count", () => {
    for (const playerCount of [3, 4, 5]) {
      for (let currentPlayerIndex = 0; currentPlayerIndex < playerCount; currentPlayerIndex += 1) {
        for (const direction of ["clockwise", "counterclockwise"] satisfies GameState["direction"][]) {
          for (const threat of ["reach", "two-call"] as const) {
            const { state, targetPlayerIndex } = stateForTacticalSevenThreat(
              playerCount,
              currentPlayerIndex,
              direction,
              threat,
              1,
              false,
            );
            const sevenPending = gameReducer(state, { type: "discard", cardId: "seven" });
            const exchange = gameReducer(sevenPending, { type: "answerDaifugoEffect", activate: true });

            expect(exchange.pendingDaifugoEffect, `${playerCount}/${currentPlayerIndex}/${direction}/${threat}`).toMatchObject({
              kind: "sevenExchange",
              playerIndex: currentPlayerIndex,
              targetPlayerIndex,
              consumeJEnhancementRightOnComplete: false,
              cpuThreatResponseMode: threat === "reach" ? "reach" : "twoCall",
            });
          }
        }
      }
    }
  });

  it("tactical CPU keeps its two-call 7 target if a reach player appears after the response mode is chosen", () => {
    const { state, targetPlayerIndex } = stateForTacticalSevenThreat(3, 0, "clockwise", "two-call");
    const sevenPending = gameReducer(state, { type: "discard", cardId: "seven" });
    const exchange = gameReducer(
      {
        ...sevenPending,
        players: sevenPending.players.map((candidate, index) => (index === 1 ? { ...candidate, isReach: true } : candidate)),
      },
      { type: "answerDaifugoEffect", activate: true },
    );

    expect(sevenPending.pendingDaifugoEffect).toMatchObject({
      kind: "confirm",
      cpuThreatResponseMode: "twoCall",
    });
    expect(exchange.pendingDaifugoEffect).toMatchObject({
      kind: "sevenExchange",
      playerIndex: 0,
      targetPlayerIndex,
      consumeJEnhancementRightOnComplete: true,
    });
  });

  it("tactical CPU prioritizes a remote reach player over a two-call player with enhanced 5", () => {
    const base = stateForFivePlayerDiscard(card("five", 5), "clockwise", daifugoOptions({ fiveSkip: true }));
    const cpuState = {
      ...base,
      players: base.players.map((candidate, index) => {
        if (index === 0) {
          return {
            ...candidate,
            isCpu: true,
            type: "cpu" as const,
            cpuModelId: "tactical" as const,
            hasJEnhancementRight: true,
          };
        }
        if (index === 1) {
          return { ...candidate, openMelds: [[card("two-call-1", 1)], [card("two-call-2", 2)]] };
        }
        return index === 2 ? { ...candidate, isReach: true } : candidate;
      }),
    };
    const fivePending = gameReducer(cpuState, { type: "discard", cardId: "five" });
    const resolved = gameReducer(fivePending, { type: "answerDaifugoEffect", activate: true });
    const next = gameReducer(resolved, { type: "confirmHandoff" });

    expect(resolved.players[0].hasJEnhancementRight).toBe(false);
    expect(resolved.lastDiscarderIndex).toBe(2);
    expect(next.currentPlayerIndex).toBe(3);
  });

  it("tactical CPU prioritizes a remote reach player over a two-call player with enhanced 7", () => {
    const base = stateForDiscard(card("seven", 7), daifugoOptions({ sevenExchange: true }));
    const cpuState = {
      ...base,
      players: base.players.map((candidate, index) => {
        if (index === 0) {
          return {
            ...candidate,
            isCpu: true,
            type: "cpu" as const,
            cpuModelId: "tactical" as const,
            hasJEnhancementRight: true,
          };
        }
        if (index === 1) {
          return { ...candidate, openMelds: [[card("two-call-1", 1)], [card("two-call-2", 2)]] };
        }
        return index === 2 ? { ...candidate, isReach: true } : candidate;
      }),
    };
    const sevenPending = gameReducer(cpuState, { type: "discard", cardId: "seven" });
    const exchange = gameReducer(sevenPending, { type: "answerDaifugoEffect", activate: true });

    expect(exchange.pendingDaifugoEffect).toMatchObject({
      kind: "sevenExchange",
      playerIndex: 0,
      targetPlayerIndex: 2,
      consumeJEnhancementRightOnComplete: true,
    });
    expect(exchange.players[0].hasJEnhancementRight).toBe(true);
  });

  it("tactical CPU uses normal 5 against an adjacent reach player before a remote two-call player", () => {
    const base = stateForFivePlayerDiscard(card("five", 5), "clockwise", daifugoOptions({ fiveSkip: true }));
    const cpuState = {
      ...base,
      players: base.players.map((candidate, index) => {
        if (index === 0) {
          return {
            ...candidate,
            isCpu: true,
            type: "cpu" as const,
            cpuModelId: "tactical" as const,
            hasJEnhancementRight: true,
          };
        }
        if (index === 1) return { ...candidate, isReach: true };
        return index === 2
          ? { ...candidate, openMelds: [[card("two-call-1", 1)], [card("two-call-2", 2)]] }
          : candidate;
      }),
    };
    const fivePending = gameReducer(cpuState, { type: "discard", cardId: "five" });
    const resolved = gameReducer(fivePending, { type: "answerDaifugoEffect", activate: true });
    const next = gameReducer(resolved, { type: "confirmHandoff" });

    expect(resolved.players[0].hasJEnhancementRight).toBe(true);
    expect(resolved.lastDiscarderIndex).toBe(1);
    expect(next.currentPlayerIndex).toBe(2);
  });

  it("tactical CPU uses normal 7 against an adjacent reach player before a remote two-call player", () => {
    const base = stateForDiscard(card("seven", 7), daifugoOptions({ sevenExchange: true }));
    const cpuState = {
      ...base,
      players: base.players.map((candidate, index) => {
        if (index === 0) {
          return {
            ...candidate,
            isCpu: true,
            type: "cpu" as const,
            cpuModelId: "tactical" as const,
            hasJEnhancementRight: true,
          };
        }
        if (index === 1) return { ...candidate, isReach: true };
        return index === 2
          ? { ...candidate, openMelds: [[card("two-call-1", 1)], [card("two-call-2", 2)]] }
          : candidate;
      }),
    };
    const sevenPending = gameReducer(cpuState, { type: "discard", cardId: "seven" });
    const exchange = gameReducer(sevenPending, { type: "answerDaifugoEffect", activate: true });

    expect(exchange.pendingDaifugoEffect).toMatchObject({
      kind: "sevenExchange",
      playerIndex: 0,
      targetPlayerIndex: 1,
      consumeJEnhancementRightOnComplete: false,
    });
    expect(exchange.players[0].hasJEnhancementRight).toBe(true);
  });

  it("tactical CPU keeps its enhancement right and uses the normal 5 target when no threat exists", () => {
    const base = stateForFivePlayerDiscard(card("five", 5), "clockwise", daifugoOptions({ fiveSkip: true }));
    const cpuState = {
      ...base,
      players: base.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              isCpu: true,
              type: "cpu" as const,
              cpuModelId: "tactical" as const,
              hasJEnhancementRight: true,
            }
          : candidate,
      ),
    };
    const fivePending = gameReducer(cpuState, { type: "discard", cardId: "five" });
    const resolved = gameReducer(fivePending, { type: "answerDaifugoEffect", activate: true });
    const next = gameReducer(resolved, { type: "confirmHandoff" });

    expect(resolved.players[0].hasJEnhancementRight).toBe(true);
    expect(resolved.lastDiscarderIndex).toBe(1);
    expect(next.currentPlayerIndex).toBe(2);
  });

  it("tactical CPU keeps its enhancement right and uses the normal 7 target when no threat exists", () => {
    const base = stateForDiscard(card("seven", 7), daifugoOptions({ sevenExchange: true }));
    const cpuState = {
      ...base,
      players: base.players.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              isCpu: true,
              type: "cpu" as const,
              cpuModelId: "tactical" as const,
              hasJEnhancementRight: true,
            }
          : candidate,
      ),
    };
    const sevenPending = gameReducer(cpuState, { type: "discard", cardId: "seven" });
    const exchange = gameReducer(sevenPending, { type: "answerDaifugoEffect", activate: true });

    expect(exchange.pendingDaifugoEffect).toMatchObject({
      kind: "sevenExchange",
      playerIndex: 0,
      targetPlayerIndex: 1,
      consumeJEnhancementRightOnComplete: false,
    });
    expect(exchange.players[0].hasJEnhancementRight).toBe(true);
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
    expect(resolved.daifugoDeckDrawEvent).toMatchObject({
      playerIndex: 0,
      effect: "tenSwapDraw",
      drawSource: "deck",
      drawnCard: expect.any(Object),
    });
  });

  it("adds the drawn card to hand after the 8 effect draw", () => {
    const pending = gameReducer(stateForDiscard(card("eight", 8)), { type: "discard", cardId: "eight" });
    const drawPending = gameReducer(pending, { type: "answerDaifugoEffect", activate: true });
    const extra = gameReducer(drawPending, { type: "drawForDaifugoEffect" });

    expect(extra.players[0].hand.some((item) => item.id === "deck-1")).toBe(true);
    expect(extra.drawnCard?.id).toBe("deck-1");
    expect(extra.daifugoDeckDrawEvent).toMatchObject({
      playerIndex: 0,
      effect: "eightExtraTurn",
      drawSource: "deck",
      drawnCard: expect.objectContaining({ id: "deck-1" }),
    });
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
      card("r1s", 1, "S"),
      card("r1h", 1, "H"),
      card("r1d", 1, "D"),
      card("r4s", 4, "S"),
      card("r4h", 4, "H"),
      card("r4d", 4, "D"),
      card("r7s", 7, "S"),
      card("r7h", 7, "H"),
      card("key", 13, "C"),
      card("loose-a", 9, "D"),
    ]);
    state.deck = [card("drawn-junk", 12, "D"), card("r7d", 7, "D")];
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
      card("r1s", 1, "S"),
      card("r1h", 1, "H"),
      card("r1d", 1, "D"),
      card("r4s", 4, "S"),
      card("r4h", 4, "H"),
      card("r4d", 4, "D"),
      card("r7s", 7, "S"),
      card("r7h", 7, "H"),
      card("key", 13, "C"),
      card("junk", 12, "D"),
    ]);
    state.deck = [card("drawn-junk", 9, "C"), card("r7d", 7, "D")];

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

  it("ends the round as a draw with no score movement when a deck draw is required at zero cards", () => {
    const state: GameState = {
      ...stateForDiscard(card("junk", 13)),
      phase: "draw",
      deck: [],
      drawnCard: null,
      drawnFrom: null,
    };
    const resolved = gameReducer(state, { type: "drawFromDeck" });

    expect(resolved.phase).toBe("result");
    expect(resolved.winner).toBeNull();
    expect(resolved.result?.winType).toBe("deckout");
    expect(resolved.result?.score.winnerScore).toBe(0);
    expect(resolved.result?.score.playerLosses).toEqual([0, 0, 0]);
  });

  it("lets a legal Q effect finish at exactly zero deck cards and deckouts on the next draw request", () => {
    const base = stateForDiscard(card("queen", 12), daifugoOptions({ queenNumberVanish: true }));
    const selecting: GameState = {
      ...base,
      players: [{ ...base.players[0], hand: [card("5s", 5), card("9h", 9), card("10d", 10)] }, base.players[1], base.players[2]],
      deck: [card("deck-5", 5), card("refill-a", 6)],
      pendingDaifugoEffect: {
        kind: "queenSelect",
        effect: "queenNumberVanish",
        playerIndex: 0,
        continue: { shouldConfirmReach: false },
      },
    };

    const resolved = gameReducer(selecting, { type: "selectQueenVanishRank", rank: 5 });
    const nextDraw = gameReducer(gameReducer(resolved, { type: "confirmHandoff" }), { type: "drawFromDeck" });

    expect(resolved.phase).toBe("handoff");
    expect(resolved.deck).toHaveLength(0);
    expect(resolved.result).toBeNull();
    expect(nextDraw.result?.winType).toBe("deckout");
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
