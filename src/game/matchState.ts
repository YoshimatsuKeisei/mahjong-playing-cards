import type { Direction, GameState, MatchMode, MatchState } from "../types";
import { createInitialGame } from "./gameState";
import { calculateRawRoundScores } from "./scoring";

export function createMatchState(
  matchMode: MatchMode,
  playerCount: number,
  direction: Direction,
  totalRounds: number,
): MatchState {
  return {
    matchMode,
    totalRounds: matchMode === "rounds" ? totalRounds : 0,
    targetScore: matchMode === "targetScore" ? totalRounds : 0,
    currentRound: 1,
    playerCount,
    direction,
    cumulativeScores: Array.from({ length: playerCount }, () => 0),
    scoredRound: null,
    gameState: createInitialGame(playerCount, direction),
  };
}

export function canAdvanceRound(matchState: MatchState | null): boolean {
  if (!matchState) return false;
  if (matchState.matchMode === "rounds") return matchState.currentRound < matchState.totalRounds;
  if (matchState.matchMode === "targetScore") return !hasReachedTargetScore(matchState);
  return false;
}

export function advanceRound(matchState: MatchState): MatchState {
  if (!canAdvanceRound(matchState)) return matchState;

  return {
    ...matchState,
    currentRound: matchState.currentRound + 1,
    scoredRound: null,
    gameState: createInitialGame(matchState.playerCount, matchState.direction),
  };
}

export function syncMatchGameState(matchState: MatchState | null, gameState: GameState): MatchState | null {
  if (!matchState) return null;

  const nextMatch = { ...matchState, gameState };
  if (nextMatch.matchMode !== "targetScore" || gameState.phase !== "result" || !gameState.result) {
    return nextMatch;
  }

  if (nextMatch.scoredRound === nextMatch.currentRound) {
    return nextMatch;
  }

  const roundScores = calculateRawRoundScores(gameState.result, nextMatch.playerCount);
  return {
    ...nextMatch,
    cumulativeScores: nextMatch.cumulativeScores.map((score, index) => score + (roundScores[index] ?? 0)),
    scoredRound: nextMatch.currentRound,
  };
}

export function hasReachedTargetScore(matchState: MatchState): boolean {
  return matchState.matchMode === "targetScore" && matchState.cumulativeScores.some((score) => score >= matchState.targetScore);
}
