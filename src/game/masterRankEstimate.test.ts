import { describe, expect, it } from "vitest";
import type { Card, Player } from "../types";
import { createMasterRankEstimate } from "./masterRankEstimate";

function card(id: string, rank: number, suit: Card["suit"] = "S", discardedByEffect?: Card["discardedByEffect"]): Card {
  return { id, rank, suit, discardedByEffect };
}

function player(id: string, overrides: Partial<Player> = {}): Player {
  return {
    id,
    name: id,
    type: "cpu",
    isCpu: true,
    cpuModelId: "standard",
    hand: [],
    discardPile: [],
    openMelds: [],
    hasCalled: false,
    isReach: false,
    ...overrides,
  };
}

describe("master rank estimate", () => {
  it("builds rank estimates from the 8-card deck base plus player-count hand expectation", () => {
    for (const playerCount of [3, 4, 5]) {
      const estimate = createMasterRankEstimate(
        { players: Array.from({ length: playerCount }, (_, index) => player(`p${index + 1}`)) },
        0,
      );
      const expectedInitial = playerCount * 10 / 13;

      for (let rank = 1; rank <= 13; rank += 1) {
        expect(estimate.deckBaseByRank[rank]).toBe(8);
        expect(estimate.estimatedInitialHandByRank[rank]).toBe(expectedInitial);
        expect(estimate.estimatedTotalByRank[rank]).toBe(8 + expectedInitial);
      }
    }
  });

  it("counts visible cards by rank without using suits or hidden opponent hands", () => {
    const estimate = createMasterRankEstimate(
      {
        players: [
          player("master", { cpuModelId: "master", hand: [card("own-3s", 3), card("own-3h", 3, "H")] }),
          player("target", {
            hand: [card("hidden-3", 3), card("hidden-13", 13)],
            discardPile: [card("discard-3", 3, "D"), card("discard-4", 4)],
            openMelds: [[card("meld-4h", 4, "H"), card("meld-4d", 4, "D")]],
          }),
          player("other", { discardPile: [card("other-5", 5)] }),
        ],
      },
      0,
    );

    expect(estimate.knownVisibleByRank[3]).toBe(3);
    expect(estimate.knownVisibleByRank[4]).toBe(3);
    expect(estimate.knownVisibleByRank[5]).toBe(1);
    expect(estimate.knownVisibleByRank[13]).toBe(0);
    expect(estimate.targetPublicByRank.target[3]).toBe(1);
    expect(estimate.targetPublicByRank.target[4]).toBe(3);
  });

  it("treats publicly vanished Q ranks as unseen zero and clamps estimates", () => {
    const estimate = createMasterRankEstimate(
      {
        players: [
          player("master", { cpuModelId: "master" }),
          player("target", {
            discardPile: [
              card("queen-removed-7", 7, "H", "queenNumberVanish"),
              ...Array.from({ length: 20 }, (_, index) => card(`many-${index}`, 6, index % 2 === 0 ? "S" : "H")),
            ],
          }),
          player("other"),
        ],
        queenVanishedRanks: [7],
      },
      0,
    );

    expect(estimate.estimatedUnseenByRank[7]).toBe(0);
    expect(estimate.estimatedUnseenByRank[6]).toBe(0);
    expect(estimate.knownVisibleByRank[7]).toBe(estimate.estimatedTotalByRank[7]);
  });
});
