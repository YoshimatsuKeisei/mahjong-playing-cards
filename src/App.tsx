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
    if (matchMode === "rounds") {
      const nextMatch = createMatchState("rounds", playerCount, direction, ruleValue);
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

  if (screen === "home") {
    return <HomeScreen entryMode={homeEntryMode} onNavigate={handleHomeNavigate} />;
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
        currentRound={matchState?.matchMode === "rounds" ? matchState.currentRound : 1}
        totalRounds={matchState?.matchMode === "rounds" ? matchState.totalRounds : 1}
        onNextRound={canAdvanceRound(matchState) ? advanceToNextRound : undefined}
        onRestart={restartToNewGame}
        onBackHome={returnToHome}
      />
    );
  }

  return (
    <PlayScreen
      state={state}
      dispatch={dispatch}
      currentRound={matchState?.matchMode === "rounds" ? matchState.currentRound : undefined}
    />
  );
}
