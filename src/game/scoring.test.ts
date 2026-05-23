import { describe, expect, it } from "vitest";
import type { Card, Player, WinningResult } from "../types";
import {
  calculateCardLoss,
  calculateRonScore,
  calculateRawRoundScores,
  calculateRawScoreFromLosses,
  calculateRawTsumoScoreFromLosses,
  calculatePointDeductions,
  calculateScoreFromLosses,
  calculateTsumoScore,
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
    type: "human",
    isCpu: false,
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

  it.each([
    { loserLoss: 29, winnerLoss: 10, expected: 19 },
    { loserLoss: 10, winnerLoss: 10, expected: 0 },
    { loserLoss: 3, winnerLoss: 10, expected: 0 },
  ])("calculates raw target-score points without multiplying by 100", ({ loserLoss, winnerLoss, expected }) => {
    expect(calculateRawScoreFromLosses(loserLoss, winnerLoss)).toBe(expected);
  });

  it("calculates raw tsumo points from the average loser loss without multiplying by 100", () => {
    expect(calculateRawTsumoScoreFromLosses([5, 63, 48], 0)).toBe(51);
  });

  it("clamps raw tsumo points to 0 when the average loser loss is not greater than the winner loss", () => {
    expect(calculateRawTsumoScoreFromLosses([10, 3, 5], 0)).toBe(0);
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

  it("uses average loser loss for normal tsumo scoring and multiplies the rounded raw score by 100", () => {
    const winningResult: WinningResult = {
      canWin: true,
      melds: [],
      keyCard: card("winner-loss", 5),
    };
    const players = [
      player("winner"),
      player("loser-a", [card("a-10", 10, "S"), card("a-3", 3, "D")]),
      player("loser-b", [card("b-8", 8, "S")]),
    ];

    expect(calculateTsumoScore(players, 0, winningResult).winnerScore).toBe(600);
  });

  it("reverses card loss during J-back scoring", () => {
    expect(calculateCardLoss(card("low", 3))).toBe(3);
    expect(calculateCardLoss(card("low", 3), true)).toBe(11);
    expect(calculateCardLoss(card("six", 6), true)).toBe(8);
    expect(calculateCardLoss(card("nine", 9), true)).toBe(5);
    expect(calculateCardLoss(card("king", 13), true)).toBe(1);
  });

  it("uses reversed losses for J-back ron scoring", () => {
    const winningResult: WinningResult = {
      canWin: true,
      melds: [],
      keyCard: card("winner-loss", 13),
    };
    const players = [player("winner"), player("discarder", [card("d-3", 3)])];

    expect(calculateRonScore(players, 0, 1, winningResult, true).winnerScore).toBe(1000);
  });

  it("uses reversed losses for J-back tsumo scoring", () => {
    const winningResult: WinningResult = {
      canWin: true,
      melds: [],
      keyCard: card("winner-loss", 13),
    };
    const players = [player("winner"), player("loser-a", [card("a-9", 9)]), player("loser-b", [card("b-6", 6)])];

    expect(calculateTsumoScore(players, 0, winningResult, true).winnerScore).toBe(600);
  });

  it("returns raw per-player round scores for target-score ron results", () => {
    expect(
      calculateRawRoundScores(
        {
          winnerIndex: 0,
          winType: "ron",
          winningResult: { canWin: true, melds: [], keyCard: card("winner-loss", 10) },
          score: { winnerScore: 1900, playerLosses: [10, 29, 3] },
          discarderIndex: 1,
        },
        3,
      ),
    ).toEqual([19, 0, 0]);
  });

  it("returns raw per-player round scores for target-score tsumo results using average loser loss", () => {
    expect(
      calculateRawRoundScores(
        {
          winnerIndex: 0,
          winType: "tsumo",
          winningResult: { canWin: true, melds: [], keyCard: card("winner-loss", 5) },
          score: { winnerScore: 5100, playerLosses: [5, 63, 48] },
          discarderIndex: null,
        },
        3,
      ),
    ).toEqual([51, 0, 0]);
  });

  it("deducts only the discarder for starting-points double ron results", () => {
    expect(
      calculatePointDeductions(
        {
          winnerIndex: 0,
          winType: "ron",
          winningResult: { canWin: true, melds: [], keyCard: card("winner-1-loss", 7) },
          score: { winnerScore: 2100, playerLosses: [7, 28, 16] },
          discarderIndex: 1,
          ronResults: [
            {
              winnerIndex: 0,
              winningResult: { canWin: true, melds: [], keyCard: card("winner-1-loss", 7) },
              score: { winnerScore: 2100, playerLosses: [7, 28, 16] },
            },
            {
              winnerIndex: 2,
              winningResult: { canWin: true, melds: [], keyCard: card("winner-3-loss", 5) },
              score: { winnerScore: 2300, playerLosses: [7, 28, 5] },
            },
          ],
        },
        3,
      ),
    ).toEqual([0, 44, 0]);
  });

  it("deducts each non-winner by the shared average-loss tsumo deduction for starting-points tsumo results", () => {
    expect(
      calculatePointDeductions(
        {
          winnerIndex: 0,
          winType: "tsumo",
          winningResult: { canWin: true, melds: [], keyCard: card("winner-loss", 5) },
          score: { winnerScore: 5100, playerLosses: [5, 63, 48] },
          discarderIndex: null,
        },
        3,
      ),
    ).toEqual([0, 51, 51]);
  });

  it("uses the shared average-loss tsumo deduction for starting-points fixture values", () => {
    expect(
      calculatePointDeductions(
        {
          winnerIndex: 1,
          winType: "tsumo",
          winningResult: { canWin: true, melds: [], keyCard: card("winner-loss", 4) },
          score: { winnerScore: 2800, playerLosses: [16, 4, 48] },
          discarderIndex: null,
        },
        3,
      ),
    ).toEqual([28, 0, 28]);
  });
});
