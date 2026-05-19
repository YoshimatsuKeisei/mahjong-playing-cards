import { useState } from "react";
import HomeScreen from "./components/HomeScreen";
import ManualScreen from "./components/ManualScreen";
import PlaceholderScreen from "./components/PlaceholderScreen";
import ProfileScreen from "./components/ProfileScreen";
import RoomListScreen from "./components/RoomListScreen";
import RoomSelectScreen from "./components/RoomSelectScreen";
import StartScreen, { type RoomCreateSettings } from "./components/StartScreen";
import PlayScreen from "./components/PlayScreen";
import ResultScreen from "./components/ResultScreen";
import FinalResultScreen from "./components/FinalResultScreen";
import { createInitialGame, gameReducer, type GameAction } from "./game/gameState";
import { advanceRound, canAdvanceRound, createMatchState, syncMatchGameState } from "./game/matchState";
import { calculatePointDeductions, calculateRawRoundScores } from "./game/scoring";
import { createDefaultDaifugoOptions } from "./game/deck";
import { createDoubleRonResultFixture, createSingleRonResultFixture, createStartingPointsTsumoResultFixture } from "./game/resultFixtures";
import type { GameState, MatchMode, MatchState, ProfileData } from "./types";
import type { HomeMenuTarget } from "./components/HomeMenu";

const initialState: GameState = {
  players: [],
  deck: [],
  currentPlayerIndex: 0,
  direction: "clockwise",
  daifugoOptions: createDefaultDaifugoOptions(),
  pendingDaifugoEffect: null,
  isJBackActive: false,
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

type AppScreen = "home" | "roomSelect" | "roomList" | "newGame" | "play" | "manual" | "moreGame" | "settings" | "profile" | "result";
type DebugResultKind = "ron" | "tsumo" | "doubleRon";
type DebugStandingsCase = "roundsNoRankChange" | "roundsRankChange" | "targetNoRankChange" | "pointsLoss";

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
    if (target === "newGame") {
      setScreen("roomSelect");
      return;
    }
    setScreen(target);
  }

  function dispatch(action: GameAction) {
    setState((currentState) => {
      const nextState = gameReducer(currentState, action);
      setMatchState((currentMatch) => syncMatchGameState(currentMatch, nextState));
      return nextState;
    });
  }

  function startGame(playerCount: number, direction: GameState["direction"], matchMode: MatchMode, ruleValue: number, roomSettings?: RoomCreateSettings) {
    if (matchMode === "rounds" || matchMode === "targetScore" || matchMode === "startingPoints") {
      const nextMatch = createMatchState(
        matchMode,
        playerCount,
        direction,
        ruleValue,
        roomSettings?.roomName,
        roomSettings?.humanPlayers ?? playerCount,
        roomSettings?.cpuModelId,
        roomSettings?.daifugoOptions,
      );
      setMatchState(nextMatch);
      setState(nextMatch.gameState);
    } else {
      const nextState = createInitialGame(
        playerCount,
        direction,
        roomSettings?.humanPlayers ?? playerCount,
        roomSettings?.cpuModelId,
        roomSettings?.daifugoOptions,
      );
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
      roomName: "DEV Room",
      totalRounds: matchMode === "rounds" ? 5 : 0,
      targetScore: matchMode === "targetScore" ? 100 : 0,
      startingPoints: matchMode === "startingPoints" ? startingPoints : 0,
      currentRound: 4,
      playerCount,
      humanPlayerCount: playerCount,
      cpuModelId: "standard",
      direction: debugState.direction,
      daifugoOptions: debugState.daifugoOptions,
      cumulativeScores: matchMode === "rounds" ? normalRoundScores : matchMode === "targetScore" ? roundScores : Array.from({ length: playerCount }, () => 0),
      pointBalances:
        matchMode === "startingPoints" ? pointDeductions.map((deduction) => startingPoints - deduction) : Array.from({ length: playerCount }, () => 0),
      history: [],
      scoredRound: 4,
      gameState: debugState,
    });
    setScreen("result");
  }

  function showDebugStandings(caseName: DebugStandingsCase) {
    const matchMode = caseName === "pointsLoss" ? "startingPoints" : caseName === "targetNoRankChange" ? "targetScore" : "rounds";
    const debugState = caseName === "pointsLoss" ? createStartingPointsTsumoResultFixture() : createSingleRonResultFixture();
    const playerCount = debugState.players.length;
    const pointDeductions = debugState.result ? calculatePointDeductions(debugState.result, playerCount) : Array.from({ length: playerCount }, () => 0);
    const startingPoints = 100;
    const standingsValues =
      caseName === "roundsNoRankChange"
        ? [5200, 2200, 1200]
        : caseName === "roundsRankChange"
          ? [5200, 4900, 1200]
          : caseName === "targetNoRankChange"
            ? [51, 20, 18]
            : Array.from({ length: playerCount }, (_, index) => startingPoints - (pointDeductions[index] ?? 0));

    setState(debugState);
    setMatchState({
      matchMode,
      roomName: "DEV Room",
      totalRounds: matchMode === "rounds" ? 5 : 0,
      targetScore: matchMode === "targetScore" ? 100 : 0,
      startingPoints: matchMode === "startingPoints" ? startingPoints : 0,
      currentRound: 4,
      playerCount,
      humanPlayerCount: playerCount,
      cpuModelId: "standard",
      direction: debugState.direction,
      daifugoOptions: debugState.daifugoOptions,
      cumulativeScores: matchMode === "startingPoints" ? Array.from({ length: playerCount }, () => 0) : standingsValues,
      pointBalances: matchMode === "startingPoints" ? standingsValues : Array.from({ length: playerCount }, () => 0),
      history: [],
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
                { label: "DEV: 成績UI / 局数制 / 順位変動なし", onClick: () => showDebugStandings("roundsNoRankChange") },
                { label: "DEV: 成績UI / 局数制 / 順位変動あり", onClick: () => showDebugStandings("roundsRankChange") },
                { label: "DEV: 成績UI / 目標点制 / 順位変動なし", onClick: () => showDebugStandings("targetNoRankChange") },
                { label: "DEV: 成績UI / 持ち点制 / 減少あり", onClick: () => showDebugStandings("pointsLoss") },
              ]
            : undefined
        }
      />
    );
  }

  if (screen === "newGame") {
    return <StartScreen onStart={startGame} onBackHome={returnToHome} onCancel={() => setScreen("roomSelect")} />;
  }

  if (screen === "roomSelect") {
    return <RoomSelectScreen onBackHome={returnToHome} onCreateRoom={() => setScreen("newGame")} onJoinRoom={() => setScreen("roomList")} />;
  }

  if (screen === "roomList") {
    return <RoomListScreen onBackHome={returnToHome} onBackToSelect={() => setScreen("roomSelect")} />;
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
    if (matchState && !canAdvanceRound(matchState)) {
      return (
        <FinalResultScreen
          matchState={matchState}
          players={state.players}
          onJoinAnotherMatch={() => setScreen("roomSelect")}
          onBackHome={returnToHome}
        />
      );
    }

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
