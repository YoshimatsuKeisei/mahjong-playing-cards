import { describe, expect, it } from "vitest";
import type { Card, DaifugoOptions } from "../types";
import { createCpuDecisionContext } from "../game/cpuTypes";
import { getTacticalDiscardScores } from "../game/tacticalCpu";
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
});
