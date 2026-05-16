import { useState } from "react";
import HomeScreen from "./components/HomeScreen";
import ManualScreen from "./components/ManualScreen";
import PlaceholderScreen from "./components/PlaceholderScreen";
import ProfileScreen from "./components/ProfileScreen";
import StartScreen from "./components/StartScreen";
import PlayScreen from "./components/PlayScreen";
import ResultScreen from "./components/ResultScreen";
import { createInitialGame, gameReducer, type GameAction } from "./game/gameState";
import { advanceRound, canAdvanceRound, createMatchState, syncMatchGameState } from "./game/matchState";
import { calculatePointDeductions, calculateRawRoundScores } from "./game/scoring";
import { createDoubleRonResultFixture, createSingleRonResultFixture, createStartingPointsTsumoResultFixture } from "./game/resultFixtures";
import type { GameState, MatchMode, MatchState, ProfileData } from "./types";
import type { HomeMenuTarget } from "./components/HomeMenu";

const initialState: GameState = {
  players: [],
  deck: [],
  currentPlayerIndex: 0,
  direction: "clockwise",
  phase: "setup",
  drawnCard: null,
  drawnFrom: null,
  lastDiscarderIndex: null,
  takenDiscardOwnerIndex: null,
  winner: null,
  result: null,
  pendingRonResult: null,
  declaredReachThisTurn: false,
  message: "",
};

type AppScreen = "home" | "newGame" | "play" | "manual" | "moreGame" | "settings" | "profile" | "result";
type DebugResultKind = "ron" | "tsumo" | "doubleRon";

export default function App() {
  const [state, setState] = useState<GameState>(initialState);
  const [matchState, setMatchState] = useState<MatchState | null>(null);
  const [screen, setScreen] = useState<AppScreen>("home");
  const [homeEntryMode, setHomeEntryMode] = useState<"initial" | "return">("initial");
  const [profile, setProfile] = useState<ProfileData>({
    userName: "Guest Player",
    comment: "今日も一局、よろしくお願いします。",
    avatarId: "fantasy-mage",
  });

  function returnToHome() {
    setHomeEntryMode("return");
    setScreen("home");
  }

  function handleHomeNavigate(target: HomeMenuTarget) {
    setScreen(target);
  }

  function dispatch(action: GameAction) {
    setState((currentState) => {
      const nextState = gameReducer(currentState, action);
      setMatchState((currentMatch) => syncMatchGameState(currentMatch, nextState));
      return nextState;
    });
  }

  function startGame(playerCount: number, direction: GameState["direction"], matchMode: MatchMode, ruleValue: number) {
    if (matchMode === "rounds" || matchMode === "targetScore" || matchMode === "startingPoints") {
      const nextMatch = createMatchState(matchMode, playerCount, direction, ruleValue);
      setMatchState(nextMatch);
      setState(nextMatch.gameState);
    } else {
      const nextState = createInitialGame(playerCount, direction);
      setMatchState(null);
      setState(nextState);
    }
    setScreen("play");
  }

  function restartToNewGame() {
    setMatchState(null);
    setState(gameReducer(state, { type: "restart" }));
    setScreen("newGame");
  }

  function advanceToNextRound() {
    setMatchState((currentMatch) => {
      if (!currentMatch || !canAdvanceRound(currentMatch)) return currentMatch;
      const nextMatch = advanceRound(currentMatch);
      setState(nextMatch.gameState);
      setScreen("play");
      return nextMatch;
    });
  }

  function createDebugResultState(kind: DebugResultKind) {
    if (kind === "ron") return createSingleRonResultFixture();
    if (kind === "doubleRon") return createDoubleRonResultFixture();
    return createStartingPointsTsumoResultFixture();
  }

  function showDebugResult(matchMode: "rounds" | "targetScore" | "startingPoints", kind: DebugResultKind) {
    const debugState = createDebugResultState(kind);
    const playerCount = debugState.players.length;
    const roundScores = debugState.result ? calculateRawRoundScores(debugState.result, playerCount) : Array.from({ length: playerCount }, () => 0);
    const normalRoundScores = calculateDebugRoundScores(debugState, playerCount);
    const pointDeductions = debugState.result ? calculatePointDeductions(debugState.result, playerCount) : Array.from({ length: playerCount }, () => 0);
    const startingPoints = 40;
    setState(debugState);
    setMatchState({
      matchMode,
      totalRounds: matchMode === "rounds" ? 5 : 0,
      targetScore: matchMode === "targetScore" ? 100 : 0,
      startingPoints: matchMode === "startingPoints" ? startingPoints : 0,
      currentRound: 4,
      playerCount,
      direction: debugState.direction,
      cumulativeScores: matchMode === "rounds" ? normalRoundScores : matchMode === "targetScore" ? roundScores : Array.from({ length: playerCount }, () => 0),
      pointBalances:
        matchMode === "startingPoints" ? pointDeductions.map((deduction) => startingPoints - deduction) : Array.from({ length: playerCount }, () => 0),
      scoredRound: 4,
      gameState: debugState,
    });
    setScreen("result");
  }

  if (screen === "home") {
    return (
      <HomeScreen
        entryMode={homeEntryMode}
        onNavigate={handleHomeNavigate}
        debugResultActions={
          import.meta.env.DEV
            ? [
                { label: "Debug Rounds Ron", onClick: () => showDebugResult("rounds", "ron") },
                { label: "Debug Rounds Tsumo", onClick: () => showDebugResult("rounds", "tsumo") },
                { label: "Debug Rounds W Ron", onClick: () => showDebugResult("rounds", "doubleRon") },
                { label: "Debug Target Ron", onClick: () => showDebugResult("targetScore", "ron") },
                { label: "Debug Target Tsumo", onClick: () => showDebugResult("targetScore", "tsumo") },
                { label: "Debug Target W Ron", onClick: () => showDebugResult("targetScore", "doubleRon") },
                { label: "Debug Points Ron", onClick: () => showDebugResult("startingPoints", "ron") },
                { label: "Debug Points Tsumo", onClick: () => showDebugResult("startingPoints", "tsumo") },
                { label: "Debug Points W Ron", onClick: () => showDebugResult("startingPoints", "doubleRon") },
              ]
            : undefined
        }
      />
    );
  }

  if (screen === "newGame") {
    return <StartScreen onStart={startGame} onBackHome={returnToHome} />;
  }

  if (screen === "manual") {
    return <ManualScreen onBackHome={returnToHome} />;
  }

  if (screen === "moreGame") {
    return <PlaceholderScreen title="More Game" body="他のゲームモードは今後追加予定です。" onBackHome={returnToHome} />;
  }

  if (screen === "settings") {
    return <PlaceholderScreen title="Setting" body="設定機能は今後追加予定です。" onBackHome={returnToHome} />;
  }

  if (screen === "profile") {
    return <ProfileScreen profile={profile} onSave={setProfile} onBackHome={returnToHome} />;
  }

  if (state.phase === "result" && state.result) {
    return (
      <ResultScreen
        state={state}
        currentRound={
          matchState?.matchMode === "rounds" || matchState?.matchMode === "targetScore" || matchState?.matchMode === "startingPoints"
            ? matchState.currentRound
            : 1
        }
        totalRounds={matchState?.matchMode === "rounds" ? matchState.totalRounds : undefined}
        useRawScore={matchState?.matchMode === "targetScore" || matchState?.matchMode === "startingPoints"}
        scoreDisplayMode={
          matchState?.matchMode === "startingPoints" ? "startingPoints" : matchState?.matchMode === "targetScore" ? "targetScore" : "score"
        }
        onNextRound={canAdvanceRound(matchState) ? advanceToNextRound : undefined}
        currentStandings={
          matchState && canAdvanceRound(matchState)
            ? {
                mode: matchState.matchMode,
                values: matchState.matchMode === "startingPoints" ? matchState.pointBalances : matchState.cumulativeScores,
                previousValues: calculatePreviousStandings(matchState, state),
                axisMax:
                  matchState.matchMode === "targetScore"
                    ? matchState.targetScore
                    : matchState.matchMode === "startingPoints"
                      ? matchState.startingPoints
                      : undefined,
              }
            : undefined
        }
        onRestart={restartToNewGame}
        onBackHome={returnToHome}
      />
    );
  }

  return (
    <PlayScreen
      state={state}
      dispatch={dispatch}
      currentRound={
        matchState?.matchMode === "rounds" || matchState?.matchMode === "targetScore" || matchState?.matchMode === "startingPoints"
          ? matchState.currentRound
          : undefined
      }
    />
  );
}

function calculatePreviousStandings(matchState: MatchState, state: GameState) {
  if (!state.result) {
    return matchState.matchMode === "startingPoints" ? matchState.pointBalances : matchState.cumulativeScores;
  }

  if (matchState.matchMode === "startingPoints") {
    const deductions = calculatePointDeductions(state.result, matchState.playerCount);
    return matchState.pointBalances.map((points, index) => points + (deductions[index] ?? 0));
  }

  const roundScores =
    matchState.matchMode === "rounds" ? calculateDebugRoundScores(state, matchState.playerCount) : calculateRawRoundScores(state.result, matchState.playerCount);
  return matchState.cumulativeScores.map((score, index) => Math.max(0, score - (roundScores[index] ?? 0)));
}

function calculateDebugRoundScores(state: GameState, playerCount: number) {
  const scores = Array.from({ length: playerCount }, () => 0);
  if (!state.result) return scores;

  if (state.result.winType === "ron" && state.result.ronResults) {
    for (const ronResult of state.result.ronResults) {
      scores[ronResult.winnerIndex] += ronResult.score.winnerScore;
    }
    return scores;
  }

  scores[state.result.winnerIndex] = state.result.score.winnerScore;
  return scores;
}
