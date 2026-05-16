import { describe, expect, it } from "vitest";
import type { MatchState } from "../types";
import { advanceRound, canAdvanceRound, createMatchState, syncMatchGameState } from "./matchState";

describe("rounds match state", () => {
  it("initializes a rounds match with the selected total rounds and starts at round 1", () => {
    const matchState = createMatchState("rounds", 4, "clockwise", 3);

    expect(matchState.matchMode).toBe("rounds");
    expect(matchState.totalRounds).toBe(3);
    expect(matchState.currentRound).toBe(1);
    expect(matchState.playerCount).toBe(4);
    expect(matchState.direction).toBe("clockwise");
  });

  it("advances to a fresh game state without carrying over one-game-only state", () => {
    const firstRound = createMatchState("rounds", 4, "clockwise", 3);
    const dirtyMatch: MatchState = {
      ...firstRound,
      gameState: {
        ...firstRound.gameState,
        deck: firstRound.gameState.deck.slice(0, 12),
        phase: "result",
        winner: 0,
        result: {
          winnerIndex: 0,
          winType: "tsumo",
          winningResult: { canWin: true, melds: [], keyCard: firstRound.gameState.players[0].hand[0] },
          score: { winnerScore: 1000, playerLosses: [1, 2, 3, 4] },
          discarderIndex: null,
        },
        players: firstRound.gameState.players.map((player, index) => ({
          ...player,
          discardPile: index === 0 ? [player.hand[0]] : [],
          openMelds: index === 0 ? [[player.hand[1], player.hand[2], player.hand[3]]] : [],
          isReach: index === 0,
          hasCalled: index === 0,
        })),
      },
    };

    const secondRound = advanceRound(dirtyMatch);

    expect(secondRound.currentRound).toBe(2);
    expect(secondRound.gameState).not.toBe(dirtyMatch.gameState);
    expect(secondRound.gameState.phase).toBe("draw");
    expect(secondRound.gameState.result).toBeNull();
    expect(secondRound.gameState.winner).toBeNull();
    expect(secondRound.gameState.deck).toHaveLength(104);
    expect(secondRound.gameState.players.every((player) => player.discardPile.length === 0)).toBe(true);
    expect(secondRound.gameState.players.every((player) => player.openMelds.length === 0)).toBe(true);
    expect(secondRound.gameState.players.every((player) => !player.isReach && !player.hasCalled)).toBe(true);
    expect(secondRound.gameState.players.every((player) => player.hand.length === 10)).toBe(true);
  });

  it("does not advance beyond the final round", () => {
    const finalRound = { ...createMatchState("rounds", 4, "clockwise", 2), currentRound: 2 };

    expect(canAdvanceRound(finalRound)).toBe(false);
    expect(advanceRound(finalRound)).toBe(finalRound);
  });

  it("initializes a target-score match and starts at round 1", () => {
    const matchState = createMatchState("targetScore", 4, "clockwise", 50);

    expect(matchState.matchMode).toBe("targetScore");
    expect(matchState.targetScore).toBe(50);
    expect(matchState.currentRound).toBe(1);
    expect(matchState.cumulativeScores).toEqual([0, 0, 0, 0]);
  });

  it("adds raw target-score points once and blocks advancing after reaching the target", () => {
    const matchState = createMatchState("targetScore", 4, "clockwise", 19);
    const resultState = {
      ...matchState.gameState,
      phase: "result" as const,
      result: {
        winnerIndex: 0,
        winType: "ron" as const,
        winningResult: { canWin: true, melds: [], keyCard: matchState.gameState.players[0].hand[0] },
        score: { winnerScore: 1900, playerLosses: [10, 29, 3, 5] },
        discarderIndex: 1,
      },
    };

    const counted = syncMatchGameState(matchState, resultState)!;
    const countedAgain = syncMatchGameState(counted, resultState)!;

    expect(counted.cumulativeScores).toEqual([19, 0, 0, 0]);
    expect(countedAgain.cumulativeScores).toEqual([19, 0, 0, 0]);
    expect(canAdvanceRound(counted)).toBe(false);
  });

  it("allows target-score matches to advance while nobody has reached the target", () => {
    const matchState = createMatchState("targetScore", 4, "clockwise", 50);
    const resultState = {
      ...matchState.gameState,
      phase: "result" as const,
      result: {
        winnerIndex: 0,
        winType: "ron" as const,
        winningResult: { canWin: true, melds: [], keyCard: matchState.gameState.players[0].hand[0] },
        score: { winnerScore: 1900, playerLosses: [10, 29, 3, 5] },
        discarderIndex: 1,
      },
    };

    const counted = syncMatchGameState(matchState, resultState)!;
    const nextRound = advanceRound(counted);

    expect(canAdvanceRound(counted)).toBe(true);
    expect(nextRound.currentRound).toBe(2);
    expect(nextRound.cumulativeScores).toEqual([19, 0, 0, 0]);
    expect(nextRound.gameState.phase).toBe("draw");
  });
});
