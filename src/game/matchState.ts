import type { Direction, GameState, MatchMode, MatchState } from "../types";
import { createInitialGame } from "./gameState";

export function createMatchState(
  matchMode: MatchMode,
  playerCount: number,
  direction: Direction,
  totalRounds: number,
): MatchState {
  return {
    matchMode,
    totalRounds,
    currentRound: 1,
    playerCount,
    direction,
    gameState: createInitialGame(playerCount, direction),
  };
}

export function canAdvanceRound(matchState: MatchState | null): boolean {
  return Boolean(matchState && matchState.matchMode === "rounds" && matchState.currentRound < matchState.totalRounds);
}

export function advanceRound(matchState: MatchState): MatchState {
  if (!canAdvanceRound(matchState)) return matchState;

  return {
    ...matchState,
    currentRound: matchState.currentRound + 1,
    gameState: createInitialGame(matchState.playerCount, matchState.direction),
  };
}

export function syncMatchGameState(matchState: MatchState | null, gameState: GameState): MatchState | null {
  return matchState ? { ...matchState, gameState } : null;
}
