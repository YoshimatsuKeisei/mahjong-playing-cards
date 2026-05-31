import { describe, expect, it } from "vitest";
import type { Card, DaifugoOptions } from "../types";
import { createCpuDecisionContext } from "../game/cpuTypes";
import { doesNineReverseIncreaseReachDistance, doesNineReverseIncreaseTwoCallDistance, getTacticalDiscardScores, tacticalCpuModel } from "../game/tacticalCpu";
import { chooseScenarioDiscard, createCpuScenario } from "./scenario";

function card(id: string, rank: number, suit: Card["suit"] = "S"): Card {
  return { id, rank, suit };
}

function enabledDaifugoOptions(overrides: Partial<DaifugoOptions["effects"]> = {}): DaifugoOptions {
  return {
    enabled: true,
    effects: {
      fiveSkip: true,
      sevenExchange: true,
      eightExtraTurn: true,
      nineReverse: true,
      tenSwapDraw: true,
      jackBack: true,
      queenNumberVanish: true,
      ...overrides,
    },
  };
}

function tacticalScores(hand: Card[], options: DaifugoOptions = enabledDaifugoOptions(), hasJEnhancementRight = false, opponentIsReach = false) {
  const state = createCpuScenario({
    phase: "discard",
    daifugoOptions: options,
    players: [
      { model: "tactical", hand, hasJEnhancementRight },
      { model: "standard", hand: [card("opponent-1", 1)], isReach: opponentIsReach },
      { model: "standard", hand: [card("opponent-2", 2)] },
    ],
  });
  return getTacticalDiscardScores(createCpuDecisionContext(state)!);
}

function tacticalScoresWithOpponents(
  hand: Card[],
  opponents: Parameters<typeof createCpuScenario>[0]["players"],
  {
    options = enabledDaifugoOptions(),
    hasJEnhancementRight = false,
    direction = "clockwise" as const,
  } = {},
) {
  const state = createCpuScenario({
    phase: "discard",
    direction,
    daifugoOptions: options,
    players: [{ model: "tactical", hand, hasJEnhancementRight }, ...opponents],
  });
  return { state, context: createCpuDecisionContext(state)!, scores: getTacticalDiscardScores(createCpuDecisionContext(state)!) };
}

function twoCalls(prefix: string): Card[][] {
  return [[card(`${prefix}-meld-1`, 1)], [card(`${prefix}-meld-2`, 2)]];
}

describe("CPU fixed scenario helper", () => {
  it("builds a tactical CPU scenario with explicit state for later priority tests", () => {
    const state = createCpuScenario({
      currentPlayerIndex: 0,
      phase: "discard",
      drawnCard: card("drawn", 13, "H"),
      drawnFrom: "deck",
      players: [
        { model: "tactical", hand: [card("3s", 3), card("3h", 3, "H"), card("drawn", 13, "H")], isReach: false, hasJEnhancementRight: true },
        { model: "standard", hand: [card("5s", 5)] },
        { model: "standard", hand: [card("9s", 9)] },
      ],
    });
    expect(state.players[0].hasJEnhancementRight).toBe(true);
    expect(state.players[0].cpuModelId).toBe("tactical");
    expect(chooseScenarioDiscard(state)?.id).toBeTruthy();
  });

  it("keeps completed meld cards when a loose tactical discard exists", () => {
    const scores = tacticalScores([
      card("triple-s", 3, "S"),
      card("triple-h", 3, "H"),
      card("triple-d", 3, "D"),
      card("loose", 13, "C"),
    ]);

    expect(scores[0].card.id).toBe("loose");
    expect(scores.filter((item) => item.card.rank === 3).every((item) => item.notes.some((note) => note.includes("completedMeldLock")))).toBe(true);
  });

  it("prefers a singleton over a pair during normal tactical play", () => {
    const scores = tacticalScores([card("pair-s", 4, "S"), card("pair-h", 4, "H"), card("loose", 6, "C")]);

    expect(scores[0].card.id).toBe("loose");
    expect(scores.filter((item) => item.card.rank === 4).every((item) => item.notes.some((note) => note.includes("normalPairProtection")))).toBe(true);
  });

  it("uses the explicit normal priority 8 > 10", () => {
    const scores = tacticalScores([card("eight", 8, "S"), card("ten", 10, "H")]);

    expect(scores.map((item) => item.card.id)).toEqual(["eight", "ten"]);
  });

  it("values J highly before gaining an enhancement right", () => {
    const scores = tacticalScores([card("jack", 11, "S"), card("nine", 9, "H"), card("low", 2, "D")]);

    expect(scores[0].card.id).toBe("jack");
  });

  it("uses Q > 7 > 5 > J after gaining an enhancement right", () => {
    const scores = tacticalScores([card("queen", 12, "S"), card("seven", 7, "H"), card("five", 5, "D"), card("jack", 11, "C")], enabledDaifugoOptions(), true);

    expect(scores.map((item) => item.card.id)).toEqual(["queen", "seven", "five", "jack"]);
  });

  it("does not add the 8 effect priority when that individual effect is disabled", () => {
    const scores = tacticalScores([card("eight", 8, "S"), card("low", 2, "H")], enabledDaifugoOptions({ eightExtraTurn: false }));
    const eight = scores.find((item) => item.card.id === "eight");

    expect(eight?.notes.some((note) => note.includes("normalDaifugoPriority"))).toBe(false);
  });

  it("does not add normal daifugo priorities when daifugo is disabled", () => {
    const scores = tacticalScores(
      [card("eight", 8, "S"), card("ten", 10, "H"), card("jack", 11, "D")],
      { ...enabledDaifugoOptions(), enabled: false },
    );

    expect(scores.every((item) => item.notes.every((note) => !note.includes("normalDaifugoPriority")))).toBe(true);
  });

  it("does not add normal daifugo priorities while any player is in reach", () => {
    const scores = tacticalScores([card("eight", 8, "S"), card("ten", 10, "H"), card("jack", 11, "D")], enabledDaifugoOptions(), false, true);

    expect(scores.every((item) => item.notes.every((note) => !note.includes("normalDaifugoPriority")))).toBe(true);
  });

  it("prefers 7 over a safe rank while the next player is in reach", () => {
    const { scores } = tacticalScoresWithOpponents(
      [card("seven", 7), card("safe", 2, "H")],
      [
        { model: "standard", hand: [card("opponent-1", 1)], discardPile: [card("safe-discard", 2, "D")], isReach: true },
        { model: "standard", hand: [card("opponent-2", 3)] },
      ],
    );

    expect(scores[0].card.id).toBe("seven");
  });

  it("prefers Q and then 5 over a safe rank while the next player is in reach", () => {
    const opponents = [
      { model: "standard" as const, hand: [card("opponent-1", 1)], discardPile: [card("safe-discard", 2, "D")], isReach: true },
      { model: "standard" as const, hand: [card("opponent-2", 3)] },
    ];
    const queen = tacticalScoresWithOpponents([card("queen", 12), card("safe", 2, "H")], opponents);
    const five = tacticalScoresWithOpponents([card("five", 5), card("safe", 2, "H")], opponents);

    expect(queen.scores[0].card.id).toBe("queen");
    expect(five.scores[0].card.id).toBe("five");
  });

  it("prefers a safe rank over an unrelated card while the next player is in reach", () => {
    const { scores } = tacticalScoresWithOpponents(
      [card("safe", 2, "H"), card("king", 13, "C")],
      [
        { model: "standard", hand: [card("opponent-1", 1)], discardPile: [card("safe-discard", 2, "D")], isReach: true },
        { model: "standard", hand: [card("opponent-2", 3)] },
      ],
    );

    expect(scores[0].card.id).toBe("safe");
  });

  it("keeps completed meld cards protected while a player is in reach", () => {
    const { scores } = tacticalScoresWithOpponents(
      [card("triple-s", 3, "S"), card("triple-h", 3, "H"), card("triple-d", 3, "D"), card("loose", 13, "C")],
      [
        { model: "standard", hand: [card("opponent-1", 1)], isReach: true },
        { model: "standard", hand: [card("opponent-2", 3)] },
      ],
    );

    expect(scores[0].card.id).toBe("loose");
    expect(scores.filter((item) => item.card.rank === 3).every((item) => item.notes.some((note) => note.includes("completedMeldLock")))).toBe(true);
  });

  it("keeps 8 ahead of 10 while the next player is in reach", () => {
    const { scores } = tacticalScoresWithOpponents(
      [card("eight", 8), card("ten", 10, "H")],
      [
        { model: "standard", hand: [card("opponent-1", 1)], isReach: true },
        { model: "standard", hand: [card("opponent-2", 3)] },
      ],
    );

    expect(scores.map((item) => item.card.id)).toEqual(["eight", "ten"]);
  });

  it("prefers enhanced 7 and enhanced 5 against a remote reach player", () => {
    const opponents = [
      { model: "standard" as const, hand: [card("opponent-1", 1)] },
      { model: "standard" as const, hand: [card("opponent-2", 3)], isReach: true },
    ];
    const enhancedSeven = tacticalScoresWithOpponents([card("seven", 7), card("safe", 2, "H")], opponents, {
      hasJEnhancementRight: true,
    });
    const enhancedFive = tacticalScoresWithOpponents(
      [card("five", 5), card("queen", 12, "H")],
      [
        { model: "standard", hand: [card("five-opponent-1", 1)] },
        { model: "standard", hand: [card("five-opponent-2", 3)], isReach: true },
        { model: "standard", hand: [card("five-opponent-3", 4)] },
        { model: "standard", hand: [card("five-opponent-4", 6)] },
      ],
      { hasJEnhancementRight: true },
    );

    expect(enhancedSeven.scores[0].card.id).toBe("seven");
    expect(enhancedFive.scores[0].card.id).toBe("five");
  });

  it("values remote-reach J as an enhancement right before 8 and 10", () => {
    const { scores } = tacticalScoresWithOpponents(
      [card("jack", 11), card("eight", 8, "H"), card("ten", 10, "D")],
      [
        { model: "standard", hand: [card("opponent-1", 1)] },
        { model: "standard", hand: [card("opponent-2", 3)], isReach: true },
      ],
    );

    expect(scores[0].card.id).toBe("jack");
  });

  it("keeps remote-reach J inspection below ordinary 7 but above an unrelated high card", () => {
    const { scores } = tacticalScoresWithOpponents(
      [card("seven", 7), card("jack", 11, "H"), card("king", 13, "D")],
      [
        { model: "standard", hand: [card("opponent-1", 1)] },
        { model: "standard", hand: [card("opponent-2", 3)], isReach: true },
      ],
      { hasJEnhancementRight: true },
    );

    expect(scores.map((item) => item.card.id)).toEqual(["seven", "jack", "king"]);
  });

  it("uses 9 only when reversing direction increases the distance to a reach player", () => {
    const beneficial = tacticalScoresWithOpponents(
      [card("nine", 9), card("king", 13, "H")],
      [
        { model: "standard", hand: [card("opponent-1", 1)] },
        { model: "standard", hand: [card("opponent-2", 2)], isReach: true },
        { model: "standard", hand: [card("opponent-3", 3)] },
        { model: "standard", hand: [card("opponent-4", 4)] },
      ],
    );
    const notBeneficial = tacticalScoresWithOpponents(
      [card("nine", 9), card("king", 13, "H")],
      [
        { model: "standard", hand: [card("opponent-1", 1)] },
        { model: "standard", hand: [card("opponent-2", 2)] },
        { model: "standard", hand: [card("opponent-3", 3)], isReach: true },
        { model: "standard", hand: [card("opponent-4", 4)] },
      ],
    );

    expect(doesNineReverseIncreaseReachDistance(beneficial.context)).toBe(true);
    expect(tacticalCpuModel.chooseDaifugoEffectActivation?.(beneficial.context, "nineReverse")).toBe(true);
    expect(doesNineReverseIncreaseReachDistance(notBeneficial.context)).toBe(false);
    expect(tacticalCpuModel.chooseDaifugoEffectActivation?.(notBeneficial.context, "nineReverse")).toBe(false);
  });

  it("uses 5 > Q > 7 while the next player has called twice", () => {
    const { scores } = tacticalScoresWithOpponents(
      [card("five", 5), card("queen", 12, "H"), card("seven", 7, "D")],
      [
        { model: "standard", hand: [card("opponent-1", 1)], openMelds: twoCalls("adjacent") },
        { model: "standard", hand: [card("opponent-2", 3)] },
      ],
    );

    expect(scores.map((item) => item.card.id)).toEqual(["five", "queen", "seven"]);
  });

  it("prefers 7 over a safe rank while the next player has called twice", () => {
    const { scores } = tacticalScoresWithOpponents(
      [card("seven", 7), card("safe", 2, "H")],
      [
        { model: "standard", hand: [card("opponent-1", 1)], discardPile: [card("safe-discard", 2, "D")], openMelds: twoCalls("adjacent") },
        { model: "standard", hand: [card("opponent-2", 3)] },
      ],
    );

    expect(scores[0].card.id).toBe("seven");
  });

  it("uses enhanced 5 against a remote two-call player", () => {
    const { scores } = tacticalScoresWithOpponents(
      [card("five", 5), card("queen", 12, "H")],
      [
        { model: "standard", hand: [card("opponent-1", 1)] },
        { model: "standard", hand: [card("opponent-2", 3)], openMelds: twoCalls("remote") },
        { model: "standard", hand: [card("opponent-3", 4)] },
        { model: "standard", hand: [card("opponent-4", 6)] },
      ],
      { hasJEnhancementRight: true },
    );

    expect(scores[0].card.id).toBe("five");
  });

  it("uses Q > 8 > 10 against a remote two-call player", () => {
    const { scores } = tacticalScoresWithOpponents(
      [card("queen", 12), card("eight", 8, "H"), card("ten", 10, "D")],
      [
        { model: "standard", hand: [card("opponent-1", 1)] },
        { model: "standard", hand: [card("opponent-2", 3)], openMelds: twoCalls("remote") },
      ],
    );

    expect(scores.map((item) => item.card.id)).toEqual(["queen", "eight", "ten"]);
  });

  it("uses 9 against a two-call player only when reversing direction increases the distance", () => {
    const beneficial = tacticalScoresWithOpponents(
      [card("nine", 9), card("king", 13, "H")],
      [
        { model: "standard", hand: [card("opponent-1", 1)] },
        { model: "standard", hand: [card("opponent-2", 2)], openMelds: twoCalls("remote") },
        { model: "standard", hand: [card("opponent-3", 3)] },
        { model: "standard", hand: [card("opponent-4", 4)] },
      ],
    );
    const notBeneficial = tacticalScoresWithOpponents(
      [card("nine", 9), card("king", 13, "H")],
      [
        { model: "standard", hand: [card("opponent-1", 1)] },
        { model: "standard", hand: [card("opponent-2", 2)] },
        { model: "standard", hand: [card("opponent-3", 3)], openMelds: twoCalls("remote") },
        { model: "standard", hand: [card("opponent-4", 4)] },
      ],
    );

    expect(doesNineReverseIncreaseTwoCallDistance(beneficial.context)).toBe(true);
    expect(tacticalCpuModel.chooseDaifugoEffectActivation?.(beneficial.context, "nineReverse")).toBe(true);
    expect(doesNineReverseIncreaseTwoCallDistance(notBeneficial.context)).toBe(false);
    expect(tacticalCpuModel.chooseDaifugoEffectActivation?.(notBeneficial.context, "nineReverse")).toBe(false);
  });

  it("keeps reach priorities ahead of two-call priorities when both threats exist", () => {
    const { scores } = tacticalScoresWithOpponents(
      [card("seven", 7), card("five", 5, "H")],
      [
        { model: "standard", hand: [card("opponent-1", 1)], isReach: true },
        { model: "standard", hand: [card("opponent-2", 3)], openMelds: twoCalls("remote") },
      ],
    );

    expect(scores[0].card.id).toBe("seven");
    expect(scores.every((item) => item.notes.every((note) => !note.includes("twoCallDaifugoPriority")))).toBe(true);
  });

  it("does not apply two-call priorities when the opponent has called only once", () => {
    const { scores } = tacticalScoresWithOpponents(
      [card("five", 5), card("queen", 12, "H")],
      [
        { model: "standard", hand: [card("opponent-1", 1)], openMelds: [[card("meld-1", 1)]] },
        { model: "standard", hand: [card("opponent-2", 3)] },
      ],
    );

    expect(scores.every((item) => item.notes.every((note) => !note.includes("twoCallDaifugoPriority")))).toBe(true);
  });

  it("does not apply reach priorities when only a two-call player is being watched", () => {
    const { scores } = tacticalScoresWithOpponents(
      [card("eight", 8), card("ten", 10, "H")],
      [
        { model: "standard", hand: [card("opponent-1", 1)], openMelds: twoCalls("adjacent") },
        { model: "standard", hand: [card("opponent-2", 3)] },
      ],
    );

    expect(scores.every((item) => item.notes.every((note) => !note.includes("reachDaifugoPriority")))).toBe(true);
    expect(scores.some((item) => item.notes.some((note) => note.includes("twoCallDaifugoPriority")))).toBe(true);
  });

  it("does not apply two-call priorities when daifugo is disabled", () => {
    const { scores } = tacticalScoresWithOpponents(
      [card("five", 5), card("queen", 12, "H")],
      [
        { model: "standard", hand: [card("opponent-1", 1)], openMelds: twoCalls("adjacent") },
        { model: "standard", hand: [card("opponent-2", 3)] },
      ],
      { options: { ...enabledDaifugoOptions(), enabled: false } },
    );

    expect(scores.every((item) => item.notes.every((note) => !note.includes("twoCallDaifugoPriority")))).toBe(true);
  });

  it("does not apply reach daifugo priorities when daifugo is disabled", () => {
    const { scores } = tacticalScoresWithOpponents(
      [card("seven", 7), card("queen", 12, "H"), card("five", 5, "D")],
      [
        { model: "standard", hand: [card("opponent-1", 1)], isReach: true },
        { model: "standard", hand: [card("opponent-2", 3)] },
      ],
      { options: { ...enabledDaifugoOptions(), enabled: false } },
    );

    expect(scores.every((item) => item.notes.every((note) => !note.includes("reachDaifugoPriority")))).toBe(true);
  });
});
