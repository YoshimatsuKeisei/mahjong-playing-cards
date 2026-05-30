import { describe, expect, it } from "vitest";
import type { Card } from "../types";
import { chooseScenarioDiscard, createCpuScenario } from "./scenario";

function card(id: string, rank: number, suit: Card["suit"] = "S"): Card {
  return { id, rank, suit };
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
});
