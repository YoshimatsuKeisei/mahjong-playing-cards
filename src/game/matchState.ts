import type { Direction, GameResult, GameState, MatchMode, MatchRoundHistoryEntry, MatchState } from "../types";
import { createInitialGame } from "./gameState";
import { calculatePointDeductions, calculateRawRoundScores } from "./scoring";

export function createMatchState(
  matchMode: MatchMode,
  playerCount: number,
  direction: Direction,
  totalRounds: number,
  roomName = "名無しのルーム",
  humanPlayerCount = playerCount,
): MatchState {
  return {
    matchMode,
    roomName,
    totalRounds: matchMode === "rounds" ? totalRounds : 0,
    targetScore: matchMode === "targetScore" ? totalRounds : 0,
    startingPoints: matchMode === "startingPoints" ? totalRounds : 0,
    currentRound: 1,
    playerCount,
    humanPlayerCount,
    direction,
    cumulativeScores: Array.from({ length: playerCount }, () => 0),
    pointBalances: Array.from({ length: playerCount }, () => (matchMode === "startingPoints" ? totalRounds : 0)),
    history: [],
    scoredRound: null,
    gameState: createInitialGame(playerCount, direction, humanPlayerCount),
  };
}

export function canAdvanceRound(matchState: MatchState | null): boolean {
  if (!matchState) return false;
  if (matchState.matchMode === "rounds") return matchState.currentRound < matchState.totalRounds;
  if (matchState.matchMode === "targetScore") return !hasReachedTargetScore(matchState);
  if (matchState.matchMode === "startingPoints") return !hasPlayerBust(matchState);
  return false;
}

export function advanceRound(matchState: MatchState): MatchState {
  if (!canAdvanceRound(matchState)) return matchState;

  return {
    ...matchState,
    currentRound: matchState.currentRound + 1,
    scoredRound: null,
    gameState: createInitialGame(matchState.playerCount, matchState.direction, matchState.humanPlayerCount),
  };
}

export function syncMatchGameState(matchState: MatchState | null, gameState: GameState): MatchState | null {
  if (!matchState) return null;

  const nextMatch = { ...matchState, gameState };
  if (gameState.phase !== "result" || !gameState.result) {
    return nextMatch;
  }

  if (nextMatch.scoredRound === nextMatch.currentRound) {
    return nextMatch;
  }

  if (nextMatch.matchMode === "startingPoints") {
    const deductions = calculatePointDeductions(gameState.result, nextMatch.playerCount);
    const pointBalances = nextMatch.pointBalances.map((points, index) => points - (deductions[index] ?? 0));
    return {
      ...nextMatch,
      pointBalances,
      history: [
        ...nextMatch.history,
        buildRoundHistoryEntry(nextMatch, gameState, Array.from({ length: nextMatch.playerCount }, () => 0), deductions, nextMatch.cumulativeScores, pointBalances),
      ],
      scoredRound: nextMatch.currentRound,
    };
  }

  const roundScores =
    nextMatch.matchMode === "rounds" ? calculateRoundScores(gameState.result, nextMatch.playerCount) : calculateRawRoundScores(gameState.result, nextMatch.playerCount);
  const cumulativeScores = nextMatch.cumulativeScores.map((score, index) => score + (roundScores[index] ?? 0));
  return {
    ...nextMatch,
    cumulativeScores,
    history: [
      ...nextMatch.history,
      buildRoundHistoryEntry(
        nextMatch,
        gameState,
        roundScores,
        Array.from({ length: nextMatch.playerCount }, () => 0),
        cumulativeScores,
        nextMatch.pointBalances,
      ),
    ],
    scoredRound: nextMatch.currentRound,
  };
}

export function hasReachedTargetScore(matchState: MatchState): boolean {
  return matchState.matchMode === "targetScore" && matchState.cumulativeScores.some((score) => score >= matchState.targetScore);
}

export function hasPlayerBust(matchState: MatchState): boolean {
  return matchState.matchMode === "startingPoints" && matchState.pointBalances.some((points) => points <= 0);
}

function calculateRoundScores(result: GameState["result"], playerCount: number): number[] {
  const scores = Array.from({ length: playerCount }, () => 0);
  if (!result) return scores;

  if (result.winType === "ron" && result.ronResults) {
    for (const ronResult of result.ronResults) {
      scores[ronResult.winnerIndex] += ronResult.score.winnerScore;
    }
    return scores;
  }

  scores[result.winnerIndex] = result.score.winnerScore;
  return scores;
}

function buildRoundHistoryEntry(
  matchState: MatchState,
  gameState: GameState,
  roundScores: number[],
  pointDeductions: number[],
  cumulativeScoresAfter: number[],
  pointBalancesAfter: number[],
): MatchRoundHistoryEntry {
  const result = gameState.result!;
  return {
    round: matchState.currentRound,
    result,
    playerLosses: getDisplayedPlayerLosses(result, matchState.playerCount),
    loserIndexes: getResultLoserIndexes(result, matchState.playerCount),
    roundScores,
    pointDeductions,
    cumulativeScoresAfter,
    pointBalancesAfter,
    calledPlayerIndexes: gameState.players.map((player, index) => (player.hasCalled ? index : -1)).filter((index) => index >= 0),
    reachPlayerIndexes: gameState.players.map((player, index) => (player.isReach ? index : -1)).filter((index) => index >= 0),
  };
}

function getDisplayedPlayerLosses(result: GameResult, playerCount: number): number[] {
  return Array.from({ length: playerCount }, (_, playerIndex) => {
    const ronResult = result.ronResults?.find((item) => item.winnerIndex === playerIndex);
    return ronResult?.score.playerLosses[playerIndex] ?? result.score.playerLosses[playerIndex] ?? 0;
  });
}

export function getResultLoserIndexes(result: GameResult, playerCount: number): number[] {
  if (result.winType === "ron" && result.discarderIndex !== null) {
    return [result.discarderIndex];
  }
  return Array.from({ length: playerCount }, (_, index) => index).filter((index) => index !== result.winnerIndex);
}
