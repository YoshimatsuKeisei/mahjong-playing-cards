import { describe, expect, it } from "vitest";
import type { Card, Player, WinningResult } from "../types";
import {
  calculateRonScore,
  calculateScoreFromLosses,
  getRonLoserIndexes,
  getTsumoLoserIndexes,
} from "./scoring";

function card(id: string, rank: number, suit: Card["suit"] = "S"): Card {
  return { id, rank, suit };
}

function player(id: string, lossCards: Card[] = []): Player {
  return {
    id,
    name: id,
    hand: [],
    discardPile: lossCards,
    openMelds: [],
    hasCalled: false,
    isReach: false,
  };
}

describe("scoring", () => {
  it.each([
    { loserLoss: 35, winnerLoss: 5, expected: 3000 },
    { loserLoss: 5, winnerLoss: 5, expected: 0 },
    { loserLoss: 3, winnerLoss: 10, expected: 0 },
  ])("calculates max(0, loser loss - winner loss) * 100", ({ loserLoss, winnerLoss, expected }) => {
    expect(calculateScoreFromLosses(loserLoss, winnerLoss)).toBe(expected);
  });

  it("uses only the discarded player as the loser for ron scoring", () => {
    const winningResult: WinningResult = {
      canWin: true,
      melds: [],
      keyCard: card("winner-loss", 5),
    };
    const players = [
      player("winner"),
      player("discarder", [card("d-10", 10, "S"), card("d-9", 9, "H"), card("d-8", 8, "D"), card("d-7", 7, "C"), card("d-1", 1, "S")]),
      player("other", [card("o-10", 10, "C"), card("o-9", 9, "D"), card("o-8", 8, "H"), card("o-7", 7, "S"), card("o-1", 1, "C")]),
    ];

    expect(getRonLoserIndexes(1)).toEqual([1]);
    expect(calculateRonScore(players, 0, 1, winningResult).winnerScore).toBe(3000);
  });

  it("uses every player except the winner as loser candidates for tsumo", () => {
    const players = [player("p1"), player("p2"), player("p3"), player("p4")];

    expect(getTsumoLoserIndexes(players, 2)).toEqual([0, 1, 3]);
  });
});
