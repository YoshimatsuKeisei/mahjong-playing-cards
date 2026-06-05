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
import { advanceRound, canAdvanceRound, createInterruptedFinalMatchState, createMatchState, syncMatchGameState } from "./game/matchState";
import { calculatePointDeductions, calculateRawRoundScores } from "./game/scoring";
import { createDefaultDaifugoOptions } from "./game/deck";
import { createDoubleRonResultFixture, createSingleRonResultFixture, createStartingPointsTsumoResultFixture } from "./game/resultFixtures";
import type { Card, GameState, MatchMode, MatchState, Player, ProfileData } from "./types";
import type { HomeMenuTarget } from "./components/HomeMenu";

const initialState: GameState = {
  players: [],
  deck: [],
  currentPlayerIndex: 0,
  direction: "clockwise",
  daifugoOptions: createDefaultDaifugoOptions(),
  pendingDaifugoEffect: null,
  queenVanishedRanks: [],
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
  showCpuActions: true,
  message: "",
};

type AppScreen = "home" | "roomSelect" | "roomList" | "newGame" | "play" | "manual" | "moreGame" | "settings" | "profile" | "result";
type ExitConfirmKind = "summary" | "home" | null;
type DebugResultKind = "ron" | "tsumo" | "doubleRon";
type DebugStandingsCase = "roundsNoRankChange" | "roundsRankChange" | "targetNoRankChange" | "pointsLoss";
export type DebugDaifugoCase =
  | "jBack"
  | "jackSelect"
  | "jackInspect3"
  | "jackInspect5"
  | "jBackStart"
  | "jBackToggleOff"
  | "eightKeepsJBack"
  | "cpuJack"
  | "jEnhancementAcquire"
  | "jEnhancementDuplicate"
  | "jEnhancementFiveSeven"
  | "jEnhancedSeven"
  | "jEnhancedSeven4"
  | "jEnhancedSeven3"
  | "jEnhancedFive"
  | "jEnhancedFive4"
  | "jEnhancedFive3"
  | "jEnhancedFiveReverse"
  | "eightTsumo"
  | "eightReach"
  | "tenTsumo"
  | "tenReach"
  | "reachTenBlocked"
  | "reachEight"
  | "queenReachRelease"
  | "queenReachContinue"
  | "sevenReachRecheck"
  | "queenSparseChoices"
  | "queenRefillBlocked"
  | "queenNoChoices"
  | "emptyDeckDraw"
  | "queenEndsWithEmptyDeck"
  | "queenAfterEffectWin";

export default function App() {
  const [state, setState] = useState<GameState>(initialState);
  const [matchState, setMatchState] = useState<MatchState | null>(null);
  const [screen, setScreen] = useState<AppScreen>("home");
  const [exitConfirmKind, setExitConfirmKind] = useState<ExitConfirmKind>(null);
  const [interruptedFinalMatchState, setInterruptedFinalMatchState] = useState<MatchState | null>(null);
  const [homeEntryMode, setHomeEntryMode] = useState<"initial" | "return">("initial");
  const [profile, setProfile] = useState<ProfileData>({
    userName: "Guest Player",
    comment: "今日も一局、よろしくお願いします。",
    avatarId: "fantasy-mage",
  });

  function returnToHome() {
    setInterruptedFinalMatchState(null);
    setExitConfirmKind(null);
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
    setInterruptedFinalMatchState(null);
    setExitConfirmKind(null);
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
        roomSettings?.cpuModelIds,
        roomSettings?.showCpuActions,
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
        roomSettings?.cpuModelIds,
        roomSettings?.showCpuActions,
      );
      setMatchState(null);
      setState(nextState);
    }
    setScreen("play");
  }

  function restartToNewGame() {
    setMatchState(null);
    setInterruptedFinalMatchState(null);
    setExitConfirmKind(null);
    setState(gameReducer(state, { type: "restart" }));
    setScreen("newGame");
  }

  function requestSummaryExit() {
    setExitConfirmKind("summary");
  }

  function requestHomeExit() {
    setExitConfirmKind("home");
  }

  function cancelExitConfirm() {
    setExitConfirmKind(null);
  }

  function confirmExit() {
    if (exitConfirmKind === "summary") {
      if (matchState) {
        setInterruptedFinalMatchState(createInterruptedFinalMatchState(matchState));
        setExitConfirmKind(null);
        setScreen("result");
        return;
      }
      restartToNewGame();
      return;
    }

    if (exitConfirmKind === "home") {
      setMatchState(null);
      setInterruptedFinalMatchState(null);
      setExitConfirmKind(null);
      setState(initialState);
      setHomeEntryMode("return");
      setScreen("home");
    }
  }

  function advanceToNextRound() {
    setMatchState((currentMatch) => {
      if (!currentMatch || !canAdvanceRound(currentMatch)) return currentMatch;
      const nextMatch = advanceRound(currentMatch);
      setInterruptedFinalMatchState(null);
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
      cpuModelIds: debugState.players.filter((player) => player.isCpu).map((player) => player.cpuModelId ?? "standard"),
      showCpuActions: debugState.showCpuActions,
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
      cpuModelIds: debugState.players.filter((player) => player.isCpu).map((player) => player.cpuModelId ?? "standard"),
      showCpuActions: debugState.showCpuActions,
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

  function showDebugDaifugo(caseName: DebugDaifugoCase) {
    const debugState = createDebugDaifugoState(caseName);
    setMatchState(null);
    setState(debugState);
    setScreen("play");
  }

  if (screen === "home") {
    return (
      <>
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
                { label: "DEV: 8効果ツモ確認", onClick: () => showDebugDaifugo("eightTsumo") },
                { label: "DEV: 8効果リーチ確認", onClick: () => showDebugDaifugo("eightReach") },
                { label: "DEV: 10効果ツモ確認", onClick: () => showDebugDaifugo("tenTsumo") },
                { label: "DEV: 10効果リーチ確認", onClick: () => showDebugDaifugo("tenReach") },
                { label: "DEV: リーチ中10禁止確認", onClick: () => showDebugDaifugo("reachTenBlocked") },
                { label: "DEV: リーチ中8確認", onClick: () => showDebugDaifugo("reachEight") },
                { label: "DEV: Q後リーチ解除", onClick: () => showDebugDaifugo("queenReachRelease") },
                { label: "DEV: Q後リーチ継続確認", onClick: () => showDebugDaifugo("queenReachContinue") },
                { label: "DEV: 7交換後リーチ再判定", onClick: () => showDebugDaifugo("sevenReachRecheck") },
                { label: "DEV: Q候補中央寄せ", onClick: () => showDebugDaifugo("queenSparseChoices") },
                { label: "DEV: Q補充不能ランク", onClick: () => showDebugDaifugo("queenRefillBlocked") },
                { label: "DEV: Q候補0件不発", onClick: () => showDebugDaifugo("queenNoChoices") },
                { label: "DEV: 山札0枚流局", onClick: () => showDebugDaifugo("emptyDeckDraw") },
                { label: "DEV: Q後山札0枚境界", onClick: () => showDebugDaifugo("queenEndsWithEmptyDeck") },
                { label: "DEV: Q後即上がり", onClick: () => showDebugDaifugo("queenAfterEffectWin") },
                { label: "DEV: J特殊効果選択", onClick: () => showDebugDaifugo("jackSelect") },
                { label: "DEV: J強化権取得", onClick: () => showDebugDaifugo("jEnhancementAcquire") },
                { label: "DEV: J強化権重複防止", onClick: () => showDebugDaifugo("jEnhancementDuplicate") },
                { label: "DEV: J強化権保持中5/7", onClick: () => showDebugDaifugo("jEnhancementFiveSeven") },
                { label: "DEV: 強化7確認 / 5人戦", onClick: () => showDebugDaifugo("jEnhancedSeven") },
                { label: "DEV: 強化7確認 / 4人戦", onClick: () => showDebugDaifugo("jEnhancedSeven4") },
                { label: "DEV: 強化7確認 / 3人戦", onClick: () => showDebugDaifugo("jEnhancedSeven3") },
                { label: "DEV: 強化5確認 / 5人戦", onClick: () => showDebugDaifugo("jEnhancedFive") },
                { label: "DEV: 強化5確認 / 4人戦", onClick: () => showDebugDaifugo("jEnhancedFive4") },
                { label: "DEV: 強化5確認 / 3人戦", onClick: () => showDebugDaifugo("jEnhancedFive3") },
                { label: "DEV: 強化5逆回り確認", onClick: () => showDebugDaifugo("jEnhancedFiveReverse") },
                { label: "DEV: J情報閲覧3人戦", onClick: () => showDebugDaifugo("jackInspect3") },
                { label: "DEV: J情報閲覧5人戦", onClick: () => showDebugDaifugo("jackInspect5") },
                { label: "DEV: CPU J暫定処理", onClick: () => showDebugDaifugo("cpuJack") },
              ]
            : undefined
        }
      />
      {exitConfirmKind && <ExitConfirmDialog kind={exitConfirmKind} onCancel={cancelExitConfirm} onConfirm={confirmExit} />}
      </>
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
    if (interruptedFinalMatchState) {
      return (
        <>
          <FinalResultScreen
            matchState={interruptedFinalMatchState}
            players={interruptedFinalMatchState.gameState.players}
            onJoinAnotherMatch={() => {
              setInterruptedFinalMatchState(null);
              setScreen("roomSelect");
            }}
            onBackHome={returnToHome}
          />
          {exitConfirmKind && <ExitConfirmDialog kind={exitConfirmKind} onCancel={cancelExitConfirm} onConfirm={confirmExit} />}
        </>
      );
    }

    if (matchState && !canAdvanceRound(matchState)) {
      return (
        <>
        <FinalResultScreen
          matchState={matchState}
          players={state.players}
          onJoinAnotherMatch={() => setScreen("roomSelect")}
          onBackHome={returnToHome}
        />
        {exitConfirmKind && <ExitConfirmDialog kind={exitConfirmKind} onCancel={cancelExitConfirm} onConfirm={confirmExit} />}
        </>
      );
    }

    return (
      <>
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
        onRestart={requestSummaryExit}
        onBackHome={returnToHome}
      />
      {exitConfirmKind && <ExitConfirmDialog kind={exitConfirmKind} onCancel={cancelExitConfirm} onConfirm={confirmExit} />}
      </>
    );
  }

  return (
    <>
    <PlayScreen
      state={state}
      dispatch={dispatch}
      currentRound={
        matchState?.matchMode === "rounds" || matchState?.matchMode === "targetScore" || matchState?.matchMode === "startingPoints"
          ? matchState.currentRound
          : undefined
      }
      onExitToHome={requestHomeExit}
    />
    {exitConfirmKind && <ExitConfirmDialog kind={exitConfirmKind} onCancel={cancelExitConfirm} onConfirm={confirmExit} />}
    </>
  );
}

function ExitConfirmDialog({ kind, onCancel, onConfirm }: { kind: Exclude<ExitConfirmKind, null>; onCancel: () => void; onConfirm: () => void }) {
  const isSummaryExit = kind === "summary";
  return (
    <div className="exit-confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="exit-confirm-title">
      <div className="exit-confirm-dialog">
        <h2 id="exit-confirm-title">{isSummaryExit ? "この試合を終了しますか？" : "試合を終了してホーム画面に戻りますか？"}</h2>
        <p>{isSummaryExit ? "現在までに完了した局の結果を集計して表示します。" : "現在の試合結果は表示されません。"}</p>
        <div className="exit-confirm-actions">
          <button type="button" className="primary-button" onClick={onConfirm}>
            はい
          </button>
          <button type="button" onClick={onCancel}>
            いいえ
          </button>
        </div>
      </div>
    </div>
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

function debugCard(id: string, rank: number, suit: Card["suit"] = "S"): Card {
  return { id, rank, suit };
}

function debugDeck(count: number, prefix: string, ranks: number[] = [1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]): Card[] {
  const suits: Card["suit"][] = ["S", "H", "D", "C"];
  return Array.from({ length: count }, (_, index) => debugCard(`${prefix}-${index}`, ranks[index % ranks.length], suits[index % suits.length]));
}

function debugPlayer(index: number, hand: Card[], isReach = false, isCpu = false): Player {
  return {
    id: `debug-player-${index}`,
    name: `プレイヤー${index}`,
    type: isCpu ? "cpu" : "human",
    isCpu,
    cpuModelId: isCpu ? "standard" : undefined,
    hand,
    discardPile: [],
    openMelds: [],
    hasCalled: false,
    isReach,
  };
}

function debugHand(prefix: string, ranks: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 13]): Card[] {
  const suits: Card["suit"][] = ["S", "H", "D", "C"];
  return ranks.map((rank, index) => debugCard(`${prefix}-${index}`, rank, suits[index % suits.length]));
}

function createDebugDaifugoOptions() {
  return {
    enabled: true,
    effects: {
      fiveSkip: true,
      sevenExchange: true,
      eightExtraTurn: true,
      nineReverse: true,
      tenSwapDraw: true,
      jackBack: true,
      queenNumberVanish: true,
    },
  };
}

export function createDebugDaifugoState(caseName: DebugDaifugoCase): GameState {
  const isJBackCase = caseName === "jBack";
  const isEnhancedSevenCase = caseName === "jEnhancedSeven" || caseName === "jEnhancedSeven4" || caseName === "jEnhancedSeven3";
  const isEnhancedFiveCase =
    caseName === "jEnhancedFive" || caseName === "jEnhancedFive4" || caseName === "jEnhancedFive3" || caseName === "jEnhancedFiveReverse";
  const isJackCase =
    caseName === "jackSelect" ||
    caseName === "jEnhancementAcquire" ||
    caseName === "jEnhancementDuplicate" ||
    caseName === "jEnhancementFiveSeven" ||
    caseName === "jackInspect3" ||
    caseName === "jackInspect5" ||
    caseName === "jBackStart" ||
    caseName === "jBackToggleOff" ||
    caseName === "cpuJack";
  const isEightKeepCase = caseName === "eightKeepsJBack";
  const effectCard = isEnhancedSevenCase
    ? debugCard("effect-7", 7, "S")
    : isEnhancedFiveCase
      ? debugCard("effect-5", 5, "S")
    : isJackCase
      ? debugCard("effect-j", 11, "S")
    : caseName.startsWith("ten") || caseName === "reachTenBlocked"
      ? debugCard("effect-10", 10, "S")
      : debugCard("effect-8", 8, "S");
  const baseHand = [
    effectCard,
    debugCard("r1", 1, "S"),
    debugCard("r2", 2, "S"),
    debugCard("r3", 3, "S"),
    debugCard("r4", 4, "S"),
    debugCard("r5", 5, "S"),
    debugCard("loose-a", 9, "D"),
    debugCard("loose-b", 10, "H"),
    debugCard("loose-c", 11, "H"),
    debugCard("loose-d", 12, "H"),
    debugCard("junk", 13, "H"),
  ];
  const jBackHand = [
    debugCard("r1", 1, "S"),
    debugCard("r2", 2, "S"),
    debugCard("r3", 3, "S"),
    debugCard("r4", 4, "S"),
    debugCard("r5", 5, "S"),
    debugCard("r6", 6, "S"),
    debugCard("loose-a", 9, "D"),
    debugCard("loose-b", 10, "H"),
    debugCard("loose-c", 11, "H"),
    debugCard("loose-d", 12, "H"),
    debugCard("junk", 13, "H"),
  ];
  const tsumoHand = [
    effectCard,
    debugCard("t1s", 1, "S"),
    debugCard("t1h", 1, "H"),
    debugCard("t1d", 1, "D"),
    debugCard("t2s", 2, "S"),
    debugCard("t2h", 2, "H"),
    debugCard("t2d", 2, "D"),
    debugCard("t3s", 3, "S"),
    debugCard("t3h", 3, "H"),
    debugCard("key", 13, "C"),
    debugCard("junk", 12, "D"),
  ];
  const isTsumoCase = caseName === "eightTsumo" || caseName === "tenTsumo";
  const isReachCase = caseName === "reachTenBlocked" || caseName === "reachEight";
  const players = [
    debugPlayer(1, isJBackCase ? jBackHand : isTsumoCase ? tsumoHand : baseHand, isReachCase),
    debugPlayer(2, isJBackCase ? [debugCard("p2-6", 6)] : [debugCard("p2-1", 1), debugCard("p2-5", 5)]),
    debugPlayer(3, isJBackCase ? [debugCard("p3-6", 6)] : [debugCard("p3-1", 1), debugCard("p3-5", 5)]),
  ];

  const makeState = (overrides: Partial<GameState>): GameState => ({
    players,
    deck: [],
    currentPlayerIndex: 0,
    direction: "clockwise",
    daifugoOptions: createDebugDaifugoOptions(),
    pendingDaifugoEffect: null,
    queenVanishedRanks: [],
    isJBackActive: caseName === "jBack",
    phase: "discard",
    drawnCard: null,
    drawnFrom: null,
    lastDiscarderIndex: null,
    takenDiscardOwnerIndex: null,
    winner: null,
    result: null,
    pendingRonResult: null,
    showCpuActions: true,
    declaredReachThisTurn: false,
    message: "DEV大富豪確認用の状態です。",
    ...overrides,
  });

  if (
    caseName === "jackSelect" ||
    caseName === "jEnhancementAcquire" ||
    caseName === "jEnhancementDuplicate" ||
    caseName === "jEnhancementFiveSeven" ||
    caseName === "jackInspect3" ||
    caseName === "jBackStart" ||
    caseName === "jBackToggleOff"
  ) {
    return makeState({
      players: [
        caseName === "jEnhancementDuplicate" || caseName === "jEnhancementFiveSeven"
          ? { ...players[0], hasJEnhancementRight: true }
          : players[0],
        debugPlayer(2, debugHand("j3-p2")),
        debugPlayer(3, debugHand("j3-p3", [2, 3, 4, 5, 6, 7, 8, 9, 10, 12])),
      ],
      isJBackActive: caseName === "jBackToggleOff",
      deck: [debugCard("j-dev-draw", 4, "C"), debugCard("j-dev-pad", 8, "D")],
      drawnCard: effectCard,
      drawnFrom: "deck",
      message: "DEV: Jを捨ててJ特殊効果を確認できます。",
    });
  }

  if (caseName === "jEnhancedSeven" || caseName === "jEnhancedSeven4" || caseName === "jEnhancedSeven3") {
    const enhancedSevenPlayers =
      caseName === "jEnhancedSeven3"
        ? [
            { ...players[0], hasJEnhancementRight: true },
            debugPlayer(2, debugHand("j7-3p-p2")),
            debugPlayer(3, debugHand("j7-3p-p3", [2, 2, 2, 5, 6, 7, 8, 9, 10, 13])),
          ]
        : caseName === "jEnhancedSeven4"
          ? [
              { ...players[0], hasJEnhancementRight: true },
              { ...debugPlayer(2, debugHand("j7-p2"), false, true), name: "プレイヤー2:standard-CPU1-long" },
              { ...debugPlayer(3, debugHand("j7-p3", [2, 2, 2, 5, 6, 7, 8, 9, 10, 13]), false, true), name: "プレイヤー3:standard-CPU2-long" },
              { ...debugPlayer(4, debugHand("j7-p4", [3, 3, 3, 4, 5, 6, 8, 10, 12, 13]), false, true), name: "プレイヤー4:standard-CPU3-long" },
            ]
        : [
            { ...players[0], hasJEnhancementRight: true },
            debugPlayer(2, debugHand("j7-p2")),
            debugPlayer(3, debugHand("j7-p3", [2, 2, 2, 5, 6, 7, 8, 9, 10, 13])),
            debugPlayer(4, debugHand("j7-p4", [3, 3, 3, 4, 5, 6, 8, 10, 12, 13])),
            debugPlayer(5, debugHand("j7-p5", [1, 4, 4, 6, 7, 9, 10, 11, 12, 13])),
          ];

    return makeState({
      players: enhancedSevenPlayers,
      deck: [debugCard("j7-dev-draw", 4, "C"), debugCard("j7-dev-pad", 8, "D")],
      drawnCard: effectCard,
      drawnFrom: "deck",
      message: "DEV: J強化権を持った状態で7を使用できます。",
    });
  }

  if (caseName === "jEnhancedFive" || caseName === "jEnhancedFive4" || caseName === "jEnhancedFive3" || caseName === "jEnhancedFiveReverse") {
    const enhancedFivePlayers =
      caseName === "jEnhancedFive3"
        ? [
            { ...players[0], hasJEnhancementRight: true },
            debugPlayer(2, debugHand("j5-3p-p2")),
            debugPlayer(3, debugHand("j5-3p-p3", [2, 2, 2, 5, 6, 7, 8, 9, 10, 13])),
          ]
        : caseName === "jEnhancedFive4"
          ? [
              { ...players[0], hasJEnhancementRight: true },
              { ...debugPlayer(2, debugHand("j5-skip-p2"), false, true), name: "プレイヤー2:standard-CPU1-long" },
              { ...debugPlayer(3, debugHand("j5-skip-p3", [2, 2, 2, 5, 6, 7, 8, 9, 10, 13]), false, true), name: "プレイヤー3:standard-CPU2-long" },
              { ...debugPlayer(4, debugHand("j5-skip-p4", [3, 3, 3, 4, 5, 6, 8, 10, 12, 13]), false, true), name: "プレイヤー4:standard-CPU3-long" },
            ]
        : [
            { ...players[0], hasJEnhancementRight: true },
            debugPlayer(2, debugHand("j5-skip-p2")),
            debugPlayer(3, debugHand("j5-skip-p3", [2, 2, 2, 5, 6, 7, 8, 9, 10, 13])),
            debugPlayer(4, debugHand("j5-skip-p4", [3, 3, 3, 4, 5, 6, 8, 10, 12, 13])),
            debugPlayer(5, debugHand("j5-skip-p5", [1, 4, 4, 6, 7, 9, 10, 11, 12, 13])),
          ];

    return makeState({
      players: enhancedFivePlayers,
      direction: caseName === "jEnhancedFiveReverse" ? "counterclockwise" : "clockwise",
      deck: [debugCard("j5-skip-dev-draw", 4, "C"), debugCard("j5-skip-dev-pad", 8, "D")],
      drawnCard: effectCard,
      drawnFrom: "deck",
      message: "DEV: J強化権を持った状態で5を使用できます。",
    });
  }

  if (caseName === "jackInspect5") {
    return makeState({
      players: [
        players[0],
        debugPlayer(2, debugHand("j5-p2")),
        debugPlayer(3, debugHand("j5-p3", [2, 3, 4, 5, 6, 7, 8, 9, 10, 12])),
        debugPlayer(4, debugHand("j5-p4", [1, 3, 5, 7, 9, 11, 12, 13, 4, 6])),
        debugPlayer(5, debugHand("j5-p5", [1, 2, 4, 6, 8, 10, 11, 12, 13, 5])),
      ],
      deck: [debugCard("j5-dev-draw", 4, "C"), debugCard("j5-dev-pad", 8, "D")],
      drawnCard: effectCard,
      drawnFrom: "deck",
      message: "DEV: 5人戦でJ情報閲覧を確認できます。",
    });
  }

  if (caseName === "eightKeepsJBack") {
    return makeState({
      isJBackActive: true,
      deck: [debugCard("e8-dev-draw", 4, "C"), debugCard("e8-dev-pad", 8, "D")],
      drawnCard: effectCard,
      drawnFrom: "deck",
      message: "DEV: 旧J効果確認用の互換ケースです。",
    });
  }

  if (caseName === "cpuJack") {
    const cpuPlayers = [
      players[0],
      debugPlayer(2, baseHand, false, true),
      players[2],
    ];
    return makeState({
      players: cpuPlayers,
      currentPlayerIndex: 1,
      deck: [debugCard("cpu-j-dev-draw", 4, "C"), debugCard("cpu-j-dev-pad", 8, "D")],
      drawnCard: effectCard,
      drawnFrom: "deck",
      message: "DEV: CPUはJシールドを選ばず、既存の自動J処理へ進みます。",
    });
  }

  if (caseName === "queenReachRelease") {
    const reachHand = [
      debugCard("qr-2s", 2, "S"),
      debugCard("qr-2h", 2, "H"),
      debugCard("qr-2d", 2, "D"),
      debugCard("qr-3s", 3, "S"),
      debugCard("qr-3h", 3, "H"),
      debugCard("qr-3d", 3, "D"),
      debugCard("qr-4s", 4, "S"),
      debugCard("qr-5s", 5, "S"),
      debugCard("qr-6s", 6, "S"),
      debugCard("qr-q", 12, "S"),
    ];
    return makeState({
      players: [debugPlayer(1, reachHand, true), players[1], players[2]],
      deck: debugDeck(24, "qr-refill", [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]),
      pendingDaifugoEffect: { kind: "queenSelect", effect: "queenNumberVanish", playerIndex: 0, continue: { shouldConfirmReach: false } },
      phase: "handoff",
      message: "DEV: Qでリーチ解除されるケースです。",
    });
  }

  if (caseName === "queenReachContinue") {
    const reachHand = [
      debugCard("qc-2s", 2, "S"),
      debugCard("qc-2h", 2, "H"),
      debugCard("qc-2d", 2, "D"),
      debugCard("qc-3s", 3, "S"),
      debugCard("qc-3h", 3, "H"),
      debugCard("qc-3d", 3, "D"),
      debugCard("qc-4s", 4, "S"),
      debugCard("qc-5s", 5, "S"),
      debugCard("qc-6s", 6, "S"),
      debugCard("qc-k", 13, "S"),
    ];
    return makeState({
      players: [debugPlayer(1, reachHand, true), players[1], players[2]],
      deck: debugDeck(24, "qc-refill", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
      pendingDaifugoEffect: { kind: "queenSelect", effect: "queenNumberVanish", playerIndex: 0, continue: { shouldConfirmReach: false } },
      phase: "handoff",
      message: "DEV: Q後もリーチ可能なため継続確認が出るケースです。",
    });
  }

  if (caseName === "sevenReachRecheck") {
    const actorHand = [debugCard("s7-7", 7, "S"), debugCard("s7-give", 9, "S"), debugCard("s7-junk", 10, "S")];
    const targetReachHand = [
      debugCard("s7-2s", 2, "S"),
      debugCard("s7-2h", 2, "H"),
      debugCard("s7-2d", 2, "D"),
      debugCard("s7-3s", 3, "S"),
      debugCard("s7-3h", 3, "H"),
      debugCard("s7-3d", 3, "D"),
      debugCard("s7-4s", 4, "S"),
      debugCard("s7-5s", 5, "S"),
      debugCard("s7-6s", 6, "S"),
      debugCard("s7-8s", 8, "S"),
    ];
    return makeState({
      players: [debugPlayer(1, actorHand), debugPlayer(2, targetReachHand, true), players[2]],
      pendingDaifugoEffect: {
        kind: "sevenExchange",
        effect: "sevenExchange",
        playerIndex: 0,
        targetPlayerIndex: 1,
        selections: {},
        continue: { shouldConfirmReach: false },
      },
      phase: "handoff",
      message: "DEV: 7交換でリーチ再判定するケースです。",
    });
  }

  if (caseName === "queenSparseChoices") {
    return makeState({
      pendingDaifugoEffect: { kind: "queenSelect", effect: "queenNumberVanish", playerIndex: 0, continue: { shouldConfirmReach: false } },
      phase: "handoff",
      queenVanishedRanks: [2, 3, 6, 8, 9, 11],
      deck: [debugCard("qs-4", 4, "S"), debugCard("qs-5", 5, "S"), debugCard("qs-7", 7, "S"), debugCard("qs-10", 10, "S")],
      message: "DEV: Q候補が減った時の中央寄せ確認です。",
    });
  }

  if (caseName === "queenRefillBlocked") {
    return makeState({
      players: [
        debugPlayer(1, [debugCard("qb-5s", 5, "S"), debugCard("qb-5h", 5, "H"), debugCard("qb-6s", 6, "S")]),
        players[1],
        players[2],
      ],
      deck: [debugCard("qb-5d", 5, "D"), debugCard("qb-8s", 8, "S"), debugCard("qb-9s", 9, "S")],
      pendingDaifugoEffect: { kind: "queenSelect", effect: "queenNumberVanish", playerIndex: 0, continue: { shouldConfirmReach: false } },
      phase: "handoff",
      message: "DEV: Q補充不能ランクの無効表示確認です。",
    });
  }

  if (caseName === "queenNoChoices") {
    return makeState({
      players: [debugPlayer(1, [debugCard("qn-5s", 5, "S"), debugCard("qn-5h", 5, "H")]), players[1], players[2]],
      deck: [debugCard("qn-5d", 5, "D")],
      pendingDaifugoEffect: { kind: "confirm", effect: "queenNumberVanish", playerIndex: 0, continue: { shouldConfirmReach: false } },
      queenVanishedRanks: [1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13],
      phase: "handoff",
      message: "DEV: Q候補0件時の不発確認です。",
    });
  }

  if (caseName === "emptyDeckDraw") {
    return makeState({
      deck: [],
      phase: "draw",
      message: "DEV: 山札0枚で通常ドローすると流局します。",
    });
  }

  if (caseName === "queenEndsWithEmptyDeck") {
    return makeState({
      players: [debugPlayer(1, [debugCard("qe-5s", 5, "S"), debugCard("qe-6s", 6, "S")]), players[1], players[2]],
      deck: [debugCard("qe-5d", 5, "D"), debugCard("qe-refill", 8, "S")],
      pendingDaifugoEffect: { kind: "queenSelect", effect: "queenNumberVanish", playerIndex: 0, continue: { shouldConfirmReach: false } },
      phase: "handoff",
      message: "DEV: Q完了後に山札が0枚になる境界ケースです。",
    });
  }

  if (caseName === "queenAfterEffectWin") {
    const qUserHand = [
      debugCard("qaw-1s", 1, "S"),
      debugCard("qaw-1h", 1, "H"),
      debugCard("qaw-1d", 1, "D"),
      debugCard("qaw-2s", 2, "S"),
      debugCard("qaw-2h", 2, "H"),
      debugCard("qaw-2d", 2, "D"),
      debugCard("qaw-3s", 3, "S"),
      debugCard("qaw-4s", 4, "S"),
      debugCard("qaw-remove-9", 9, "H"),
      debugCard("qaw-key", 13, "C"),
    ];
    return makeState({
      players: [{ ...debugPlayer(1, qUserHand), discardPile: [debugCard("qaw-used-q", 12, "D")] }, players[1], players[2]],
      deck: [debugCard("qaw-refill-5", 5, "S"), debugCard("qaw-pad-6", 6, "H"), debugCard("qaw-pad-7", 7, "D")],
      pendingDaifugoEffect: { kind: "queenSelect", effect: "queenNumberVanish", playerIndex: 0, continue: { shouldConfirmReach: false } },
      phase: "handoff",
      message: "DEV: Q補充ドローで即上がりするケースです。9を選んでください。",
    });
  }

  return {
    players,
    deck: isTsumoCase
      ? [debugCard("t3d", 3, "D"), debugCard("deck-pad", 6, "C")]
      : [debugCard("r6", 6, "S"), debugCard("deck-pad", 7, "C")],
    currentPlayerIndex: 0,
    direction: "clockwise",
    daifugoOptions: createDebugDaifugoOptions(),
    pendingDaifugoEffect: null,
    queenVanishedRanks: [],
    isJBackActive: caseName === "jBack",
    phase: "discard",
    drawnCard: isJBackCase ? jBackHand.find((card) => card.id === "r6") ?? null : effectCard,
    drawnFrom: "deck",
    lastDiscarderIndex: null,
    takenDiscardOwnerIndex: null,
    winner: null,
    result: null,
    pendingRonResult: null,
    showCpuActions: true,
    declaredReachThisTurn: false,
    message: "DEV大富豪確認用の状態です。",
  };
}

function calculateDebugRoundScores(state: GameState, playerCount: number) {
  const scores = Array.from({ length: playerCount }, () => 0);
  if (!state.result) return scores;
  if (state.result.winType === "deckout") return scores;

  if (state.result.winType === "ron" && state.result.ronResults) {
    for (const ronResult of state.result.ronResults) {
      scores[ronResult.winnerIndex] += ronResult.score.winnerScore;
    }
    return scores;
  }

  scores[state.result.winnerIndex] = state.result.score.winnerScore;
  return scores;
}
