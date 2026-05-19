import { describe, expect, it } from "vitest";
import type { Card, GameState, Player } from "../types";
import { cpuModels, getCpuModel } from "./cpuModelRegistry";
import { createCpuDecisionContext } from "./cpuTypes";
import { getTacticalDiscardScores, tacticalChooseCpuCall, tacticalChooseCpuDiscardCard } from "./tacticalCpu";

function card(id: string, rank: number, suit: Card["suit"] = "S"): Card {
  return { id, rank, suit };
}

function player(index: number, hand: Card[], discardPile: Card[] = [], openMelds: Card[][] = []): Player {
  return {
    id: `player-${index}`,
    name: `プレイヤー${index}`,
    type: index === 2 ? "cpu" : "human",
    isCpu: index === 2,
    cpuModelId: index === 2 ? "tactical" : undefined,
    hand,
    discardPile,
    openMelds,
    hasCalled: openMelds.length > 0,
    isReach: false,
  };
}

function state(players: Player[], currentPlayerIndex = 1): GameState {
  return {
    players,
    deck: [card("deck-1", 1)],
    currentPlayerIndex,
    direction: "clockwise",
    phase: "draw",
    drawnCard: null,
    drawnFrom: null,
    lastDiscarderIndex: currentPlayerIndex - 1,
    takenDiscardOwnerIndex: null,
    winner: null,
    result: null,
    pendingRonResult: null,
    declaredReachThisTurn: false,
    message: "",
  };
}

describe("CPU models", () => {
  it("registers standard and tactical models", () => {
    expect(cpuModels.standard.name).toBe("Standard CPU");
    expect(cpuModels.tactical.name).toBe("Tactical CPU");
    expect(getCpuModel("standard").id).toBe("standard");
    expect(getCpuModel("tactical").id).toBe("tactical");
  });

  it("tactical CPU avoids a call that does not increase meld count", () => {
    const gameState = state([
      player(1, [], [card("discard-5c", 5, "C")]),
      player(2, [card("5s", 5, "S"), card("5h", 5, "H"), card("5d", 5, "D"), card("9s", 9, "S")]),
      player(3, []),
    ]);
    const context = createCpuDecisionContext(gameState)!;

    expect(tacticalChooseCpuCall(context)).toBeNull();
  });

  it("tactical CPU treats reach discard ranks as safer discard candidates", () => {
    const reachPlayer = { ...player(1, [], [card("discard-7d", 7, "D"), card("discard-7c", 7, "C")]), isReach: true };
    const gameState = {
      ...state([reachPlayer, player(2, [card("safe-7s", 7, "S"), card("high-13h", 13, "H")]), player(3, [])]),
      phase: "discard" as const,
      drawnCard: card("drawn-2c", 2, "C"),
    };
    const context = createCpuDecisionContext(gameState)!;

    expect(tacticalChooseCpuDiscardCard(context)?.rank).toBe(7);
  });

  it("tactical CPU adds a safety bonus for the previous player with two completed melds", () => {
    const previousOpenMelds = [
      [card("m1-3s", 3, "S"), card("m1-3h", 3, "H"), card("m1-3d", 3, "D")],
      [card("m2-6s", 6, "S"), card("m2-6h", 6, "H"), card("m2-6d", 6, "D")],
    ];
    const gameState = {
      ...state([
        player(1, [], [card("discard-4d", 4, "D")], previousOpenMelds),
        player(2, [card("safe-4s", 4, "S"), card("high-13h", 13, "H")]),
        player(3, []),
      ]),
      phase: "discard" as const,
      drawnCard: card("drawn-2c", 2, "C"),
    };
    const context = createCpuDecisionContext(gameState)!;

    const safeScore = getTacticalDiscardScores(context).find((item) => item.card.rank === 4);

    expect(safeScore?.notes.some((note) => note.includes("safeRank"))).toBe(true);
  });
});
