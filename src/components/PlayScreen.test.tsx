import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createInitialGame, gameReducer } from "../game/gameState";
import { createMatchState } from "../game/matchState";
import { createDebugDaifugoState } from "../App";
import type { Card, GameState, MatchState } from "../types";
import PlayScreen from "./PlayScreen";

function card(id: string, rank: number, suit: Card["suit"]): Card {
  return { id, rank, suit };
}

function createHistoryState(playerCount: number): GameState {
  const state = createInitialGame(playerCount, "clockwise");
  return {
    ...state,
    players: state.players.map((player, index) =>
      index === 1
        ? {
            ...player,
            discardPile: [card("discard-3c", 3, "C"), card("discard-7d", 7, "D"), card("discard-10s", 10, "S")],
            openMelds: [[card("meld-8s", 8, "S"), card("meld-8h", 8, "H"), card("meld-8d", 8, "D")]],
          }
        : player,
    ),
  };
}

function createOnlineRoom() {
  return {
    roomId: "ROOM1",
    hostPlayerId: "player-1",
    maxPlayers: 2,
    totalPlayers: 4,
    cpuPlayers: 2,
    players: [
      { playerId: "player-1", name: "Alice", ready: true, connected: true },
      { playerId: "player-2", name: "Bob", ready: true, connected: true },
    ],
    started: true,
  };
}

function createOnlineMatchState(matchMode: MatchState["matchMode"] = "rounds") {
  const ruleValue =
    matchMode === "targetScore" ? 80 : matchMode === "startingPoints" ? 30 : 4;
  return createMatchState(
    matchMode,
    4,
    "clockwise",
    ruleValue,
    "テストルーム",
    2,
    "standard",
    undefined,
    ["standard", "tactical"],
    true,
  );
}

describe("PlayScreen round display", () => {
  it("shows the current round on the play screen", () => {
    render(<PlayScreen state={createInitialGame(4, "clockwise")} dispatch={vi.fn()} currentRound={1} />);

    expect(screen.getByText("- 1回戦 -")).toBeInTheDocument();
  });

  it("renders the room settings action only when an exit handler is provided", async () => {
    const user = userEvent.setup();
    const onExitToHome = vi.fn();
    const { rerender } = render(<PlayScreen state={createInitialGame(4, "clockwise")} dispatch={vi.fn()} currentRound={1} />);

    expect(screen.queryByRole("button", { name: "設定" })).not.toBeInTheDocument();

    rerender(<PlayScreen state={createInitialGame(4, "clockwise")} dispatch={vi.fn()} currentRound={1} onExitToHome={onExitToHome} />);
    await user.click(screen.getByRole("button", { name: "設定" }));
    const dialog = screen.getByRole("dialog", { name: "設定" });
    await user.click(within(dialog).getAllByRole("button", { name: "退出" }).at(-1)!);

    expect(onExitToHome).toHaveBeenCalledTimes(1);
  });

  it("shows host-only room management tabs only to the host", async () => {
    const user = userEvent.setup();
    const room = {
      roomId: "ROOM1",
      hostPlayerId: "player-1",
      maxPlayers: 4,
      totalPlayers: 4,
      cpuPlayers: 1,
      players: [
        { playerId: "player-1", name: "Alice", ready: true, connected: true },
        { playerId: "player-2", name: "Bob", ready: true, connected: true },
      ],
      started: true,
    };
    const { rerender } = render(
      <PlayScreen
        state={createInitialGame(4, "clockwise")}
        dispatch={vi.fn()}
        currentRound={1}
        onExitToHome={vi.fn()}
        onlineRoom={room}
        onlinePlayerId="player-2"
      />,
    );

    await user.click(screen.getByRole("button", { name: "設定" }));
    expect(screen.queryByRole("tab", { name: "ホストを変更" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "試合情報" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "キャンセル" }));
    rerender(
      <PlayScreen
        state={createInitialGame(4, "clockwise")}
        dispatch={vi.fn()}
        currentRound={1}
        onExitToHome={vi.fn()}
        onlineRoom={room}
        onlinePlayerId="player-1"
      />,
    );
    await user.click(screen.getByRole("button", { name: "設定" }));

    expect(screen.getByRole("tab", { name: "ホストを変更" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "試合情報" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "一時離脱" })).toBeInTheDocument();
  });

  it("transfers host only to selectable human connected players", async () => {
    const user = userEvent.setup();
    const onTransferHost = vi.fn();
    const room = {
      roomId: "ROOM1",
      hostPlayerId: "player-1",
      maxPlayers: 4,
      totalPlayers: 4,
      cpuPlayers: 1,
      players: [
        { playerId: "player-1", name: "Alice", ready: true, connected: true },
        { playerId: "player-2", name: "Bob", ready: true, connected: true },
        { playerId: "player-3", name: "Carol", ready: true, connected: false },
        { playerId: "cpu-1", name: "CPU 1", ready: true, connected: true },
      ],
      started: true,
    };

    render(
      <PlayScreen
        state={createInitialGame(4, "clockwise")}
        dispatch={vi.fn()}
        currentRound={1}
        onExitToHome={vi.fn()}
        onlineRoom={room}
        onlinePlayerId="player-1"
        onTransferHost={onTransferHost}
      />,
    );

    await user.click(screen.getByRole("button", { name: "設定" }));
    await user.click(screen.getByRole("tab", { name: "ホストを変更" }));

    expect(screen.getByRole("button", { name: "Bob" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Alice" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Carol" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "CPU 1" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Bob" }));
    expect(onTransferHost).toHaveBeenCalledWith("player-2");
  });

  it("starts temporary leave from the room management tab", async () => {
    const user = userEvent.setup();
    const onStartTemporaryLeave = vi.fn();
    const matchState = createOnlineMatchState("rounds");

    render(
      <PlayScreen
        state={matchState.gameState}
        dispatch={vi.fn()}
        currentRound={1}
        onExitToHome={vi.fn()}
        onlineRoom={createOnlineRoom()}
        onlinePlayerId="player-1"
        matchState={matchState}
        onStartTemporaryLeave={onStartTemporaryLeave}
      />,
    );

    await user.click(screen.getByRole("button", { name: "設定" }));
    await user.click(screen.getByRole("tab", { name: "一時離脱" }));
    expect(screen.getByText("一時離脱しますか？")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "中断する" }));
    expect(onStartTemporaryLeave).toHaveBeenCalledWith("pause");
  });

  it("shows temporary leave status during online play", () => {
    const matchState = createOnlineMatchState("rounds");
    render(
      <PlayScreen
        state={matchState.gameState}
        dispatch={vi.fn()}
        currentRound={1}
        onExitToHome={vi.fn()}
        onlineRoom={{
          ...createOnlineRoom(),
          temporaryLeaves: [
            {
              playerId: "player-2",
              playerName: "Player2: Guest Player",
              playerIndex: 1,
              mode: "cpuSubstitute",
              expiresAt: Date.now() + 60000,
              convertedToCpu: false,
            },
          ],
        }}
        onlinePlayerId="player-1"
        matchState={matchState}
      />,
    );

    expect(screen.getByTestId("temporary-leave-status")).toHaveTextContent(
      "CPU代行中",
    );
  });

  it("shows match info to non-host players without change controls", async () => {
    const user = userEvent.setup();
    const room = createOnlineRoom();
    const baseMatchState = createOnlineMatchState("rounds");
    const matchState = {
      ...baseMatchState,
      gameState: {
        ...baseMatchState.gameState,
        players: baseMatchState.gameState.players.map((player, index) =>
          index === 0
            ? { ...player, name: "Player1: Guest Player" }
            : index === 2
              ? { ...player, name: "CPU 3" }
              : player,
        ),
      },
    };

    render(
      <PlayScreen
        state={matchState.gameState}
        dispatch={vi.fn()}
        currentRound={1}
        onExitToHome={vi.fn()}
        onlineRoom={room}
        onlinePlayerId="player-2"
        matchState={matchState}
      />,
    );

    await user.click(screen.getByRole("button", { name: "設定" }));
    await user.click(screen.getByRole("tab", { name: "試合情報" }));
    const dialog = screen.getByRole("dialog", { name: "設定" });

    expect(within(dialog).getByText("テストルーム")).toBeInTheDocument();
    expect(within(dialog).getByText("Player1: Guest Player")).toBeInTheDocument();
    expect(within(dialog).queryByText(/Player1: Player1:/)).not.toBeInTheDocument();
    expect(within(dialog).getByText("Player3: CPU 3 standard-CPU")).toBeInTheDocument();
    expect(within(dialog).getByText("4人")).toBeInTheDocument();
    expect(within(dialog).getByText("局数制")).toBeInTheDocument();
    expect(within(dialog).getByText("最大4局")).toBeInTheDocument();
    expect(within(dialog).getByText("1局目")).toBeInTheDocument();
    expect(within(dialog).getByText("HOST")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "変更" })).not.toBeInTheDocument();
  });

  it("lets the host increase round count from the match info tab", async () => {
    const user = userEvent.setup();
    const onUpdateMatchSettings = vi.fn();
    const matchState = createOnlineMatchState("rounds");

    render(
      <PlayScreen
        state={matchState.gameState}
        dispatch={vi.fn()}
        currentRound={1}
        onExitToHome={vi.fn()}
        onlineRoom={createOnlineRoom()}
        onlinePlayerId="player-1"
        matchState={matchState}
        onUpdateMatchSettings={onUpdateMatchSettings}
      />,
    );

    await user.click(screen.getByRole("button", { name: "設定" }));
    await user.click(screen.getByRole("tab", { name: "試合情報" }));
    await user.click(screen.getByRole("button", { name: "変更" }));
    const input = screen.getByLabelText("最大局数");
    await user.clear(input);
    await user.type(input, "6");
    await user.click(screen.getByRole("button", { name: "確定" }));

    expect(onUpdateMatchSettings).toHaveBeenCalledWith({
      matchType: "rounds",
      roundCount: 6,
    });
  });

  it("rejects round count changes that do not exceed the current round", async () => {
    const user = userEvent.setup();
    const onUpdateMatchSettings = vi.fn();
    const matchState = { ...createOnlineMatchState("rounds"), currentRound: 3 };

    render(
      <PlayScreen
        state={matchState.gameState}
        dispatch={vi.fn()}
        currentRound={3}
        onExitToHome={vi.fn()}
        onlineRoom={createOnlineRoom()}
        onlinePlayerId="player-1"
        matchState={matchState}
        onUpdateMatchSettings={onUpdateMatchSettings}
      />,
    );

    await user.click(screen.getByRole("button", { name: "設定" }));
    await user.click(screen.getByRole("tab", { name: "試合情報" }));
    await user.click(screen.getByRole("button", { name: "変更" }));
    const input = screen.getByLabelText("最大局数");
    await user.clear(input);
    await user.type(input, "3");
    await user.click(screen.getByRole("button", { name: "確定" }));

    expect(screen.getByText("現在の局数以下には変更できません。")).toBeInTheDocument();
    expect(onUpdateMatchSettings).not.toHaveBeenCalled();
  });

  it("allows 100 rounds but rejects round counts over 100", async () => {
    const user = userEvent.setup();
    const onUpdateMatchSettings = vi.fn();
    const matchState = createOnlineMatchState("rounds");

    render(
      <PlayScreen
        state={matchState.gameState}
        dispatch={vi.fn()}
        currentRound={1}
        onExitToHome={vi.fn()}
        onlineRoom={createOnlineRoom()}
        onlinePlayerId="player-1"
        matchState={matchState}
        onUpdateMatchSettings={onUpdateMatchSettings}
      />,
    );

    await user.click(screen.getByRole("button", { name: "設定" }));
    await user.click(screen.getByRole("tab", { name: "試合情報" }));
    await user.click(screen.getByRole("button", { name: "変更" }));
    const input = screen.getByLabelText("最大局数");
    await user.clear(input);
    await user.type(input, "101");
    await user.click(screen.getByRole("button", { name: "確定" }));
    expect(screen.getByText("最大局数は100局までです。")).toBeInTheDocument();
    expect(onUpdateMatchSettings).not.toHaveBeenCalled();

    await user.clear(input);
    await user.type(input, "100");
    await user.click(screen.getByRole("button", { name: "確定" }));
    expect(onUpdateMatchSettings).toHaveBeenCalledWith({
      matchType: "rounds",
      roundCount: 100,
    });
  });

  it("lets the host increase target score but keeps starting points read-only", async () => {
    const user = userEvent.setup();
    const onUpdateMatchSettings = vi.fn();
    const targetScoreMatch = createOnlineMatchState("targetScore");
    const { rerender } = render(
      <PlayScreen
        state={targetScoreMatch.gameState}
        dispatch={vi.fn()}
        currentRound={1}
        onExitToHome={vi.fn()}
        onlineRoom={createOnlineRoom()}
        onlinePlayerId="player-1"
        matchState={targetScoreMatch}
        onUpdateMatchSettings={onUpdateMatchSettings}
      />,
    );

    await user.click(screen.getByRole("button", { name: "設定" }));
    await user.click(screen.getByRole("tab", { name: "試合情報" }));
    expect(screen.getByText("目標点制")).toBeInTheDocument();
    expect(screen.getByText("目標80点")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "変更" }));
    const input = screen.getByLabelText("目標点");
    await user.clear(input);
    await user.type(input, "100");
    await user.click(screen.getByRole("button", { name: "確定" }));
    expect(onUpdateMatchSettings).toHaveBeenCalledWith({
      matchType: "targetScore",
      targetScore: 100,
    });

    const startingPointsMatch = createOnlineMatchState("startingPoints");
    rerender(
      <PlayScreen
        state={startingPointsMatch.gameState}
        dispatch={vi.fn()}
        currentRound={1}
        onExitToHome={vi.fn()}
        onlineRoom={createOnlineRoom()}
        onlinePlayerId="player-1"
        matchState={startingPointsMatch}
        onUpdateMatchSettings={onUpdateMatchSettings}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "試合情報" }));
    expect(screen.getByText("持ち点制")).toBeInTheDocument();
    expect(screen.getByText("初期持ち点30点")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "変更" })).not.toBeInTheDocument();
  });

  it("validates target score range and current highest score", async () => {
    const user = userEvent.setup();
    const onUpdateMatchSettings = vi.fn();
    const targetScoreMatch = {
      ...createOnlineMatchState("targetScore"),
      cumulativeScores: [80, 20, 0, 0],
    };

    render(
      <PlayScreen
        state={targetScoreMatch.gameState}
        dispatch={vi.fn()}
        currentRound={1}
        onExitToHome={vi.fn()}
        onlineRoom={createOnlineRoom()}
        onlinePlayerId="player-1"
        matchState={targetScoreMatch}
        onUpdateMatchSettings={onUpdateMatchSettings}
      />,
    );

    await user.click(screen.getByRole("button", { name: "設定" }));
    await user.click(screen.getByRole("tab", { name: "試合情報" }));
    await user.click(screen.getByRole("button", { name: "変更" }));
    const input = screen.getByLabelText("目標点");

    await user.clear(input);
    await user.type(input, "49");
    await user.click(screen.getByRole("button", { name: "確定" }));
    expect(screen.getByText("目標点は50〜10000の範囲で入力してください。")).toBeInTheDocument();

    await user.clear(input);
    await user.type(input, "80");
    await user.click(screen.getByRole("button", { name: "確定" }));
    expect(screen.getByText("現在の最高得点以下には変更できません。")).toBeInTheDocument();

    await user.clear(input);
    await user.type(input, "10001");
    await user.click(screen.getByRole("button", { name: "確定" }));
    expect(screen.getByText("目標点は50〜10000の範囲で入力してください。")).toBeInTheDocument();
    expect(onUpdateMatchSettings).not.toHaveBeenCalled();
  });

  it("shows the phase 2-A J special effect choices", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    const state: GameState = {
      ...createInitialGame(3, "clockwise"),
      phase: "handoff",
      pendingDaifugoEffect: {
        kind: "jackSelect",
        effect: "jackBack",
        playerIndex: 0,
        continue: { shouldConfirmReach: false },
      },
    };

    render(<PlayScreen state={state} dispatch={dispatch} currentRound={1} />);

    expect(screen.getByText("J特殊効果を選択してください")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /情報閲覧/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Jシールド/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /5\/7強化権/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /情報閲覧/ }));
    expect(dispatch).toHaveBeenCalledWith({ type: "selectJackSpecialEffect", effect: "inspectHands" });
  });

  it("disables duplicate J enhancement selection while leaving other J choices available", () => {
    const state: GameState = {
      ...createInitialGame(3, "clockwise"),
      phase: "handoff",
      pendingDaifugoEffect: {
        kind: "jackSelect",
        effect: "jackBack",
        playerIndex: 0,
        continue: { shouldConfirmReach: false },
      },
      players: createInitialGame(3, "clockwise").players.map((player, index) =>
        index === 0 ? { ...player, hasJEnhancementRight: true } : player,
      ),
    };

    render(<PlayScreen state={state} dispatch={vi.fn()} currentRound={1} />);

    expect(screen.getByRole("button", { name: /5\/7強化権/ })).toBeDisabled();
    expect(screen.getByText("すでに強化権を保持しています")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /情報閲覧/ })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /Jシールド/ })).not.toBeDisabled();
  });

  it("shows the public J enhancement right badge only for the holder", () => {
    const baseState = createInitialGame(3, "clockwise");
    const state: GameState = {
      ...baseState,
      players: baseState.players.map((player, index) => (index === 1 ? { ...player, hasJEnhancementRight: true } : player)),
    };

    render(<PlayScreen state={state} dispatch={vi.fn()} currentRound={1} />);

    expect(screen.getByText("J強化権あり")).toBeInTheDocument();
    expect(screen.getAllByText("J強化権あり")).toHaveLength(1);
  });

  it("shows enhanced 7 confirmation for a human holder", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    const baseState = createInitialGame(3, "clockwise");
    const state: GameState = {
      ...baseState,
      phase: "handoff",
      pendingDaifugoEffect: {
        kind: "sevenEnhancementConfirm",
        effect: "sevenExchange",
        playerIndex: 0,
        continue: { shouldConfirmReach: false },
      },
      players: baseState.players.map((player, index) => (index === 0 ? { ...player, hasJEnhancementRight: true } : player)),
    };

    render(<PlayScreen state={state} dispatch={dispatch} currentRound={1} />);

    expect(screen.getByText("J強化を使用しますか？")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "はい" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "answerSevenEnhancement", useEnhancement: true });
  });

  it("shows every opponent and excludes self for enhanced 7 target selection", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    const baseState = createInitialGame(4, "clockwise");
    const state: GameState = {
      ...baseState,
      phase: "handoff",
      pendingDaifugoEffect: {
        kind: "sevenEnhancedTargetSelect",
        effect: "sevenExchange",
        playerIndex: 0,
        continue: { shouldConfirmReach: false },
      },
      players: baseState.players.map((player, index) => (index === 0 ? { ...player, hasJEnhancementRight: true } : player)),
    };

    const { container } = render(<PlayScreen state={state} dispatch={dispatch} currentRound={1} />);

    expect(screen.getByText("交換相手を選択してください")).toBeInTheDocument();
    expect(screen.getByTestId("enhanced-seven-target-table")).toBeInTheDocument();
    expect(screen.getByTestId("enhanced-round-table")).toBeInTheDocument();
    expect(container.querySelector(".enhanced-target-table-core span")).toBeNull();
    expect(container.querySelector(".action-panel")).toHaveClass("enhanced-target-action-panel");
    expect(container.querySelectorAll(".enhanced-target-seat-icon")).toHaveLength(4);
    expect(screen.getAllByTestId("enhanced-target-player-silhouette")).toHaveLength(4);
    expect(container.querySelector(".enhanced-target-seat-person")).toBeNull();
    expect(screen.queryByTestId("enhanced-five-turn-guide-3")).not.toBeInTheDocument();
    expect(screen.queryByText("宇宙")).not.toBeInTheDocument();
    expect(screen.queryByText("次の手番")).not.toBeInTheDocument();
    expect(screen.queryByText("スキップ")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "プレイヤー1" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "プレイヤー2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "プレイヤー3" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "プレイヤー4" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "プレイヤー4" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "selectEnhancedSevenTarget", targetPlayerIndex: 3 });
  });

  it("marks only the selected enhanced 7 exchange partner", () => {
    const baseState = createInitialGame(5, "clockwise");
    const state: GameState = {
      ...baseState,
      phase: "handoff",
      pendingDaifugoEffect: {
        kind: "sevenEnhancedTargetSelect",
        effect: "sevenExchange",
        playerIndex: 0,
        selectedTargetPlayerIndex: 3,
        continue: { shouldConfirmReach: false },
      },
      players: baseState.players.map((player, index) => (index === 0 ? { ...player, hasJEnhancementRight: true } : player)),
    };

    render(<PlayScreen state={state} dispatch={vi.fn()} currentRound={1} />);

    expect(screen.getByTestId("enhanced-seven-exchange-mark")).toBeInTheDocument();
    expect(screen.queryByTestId("enhanced-five-turn-guide-3")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: baseState.players[3].name })).toHaveClass("exchange-target", "persistent-outline");
    expect(screen.getByRole("button", { name: baseState.players[1].name })).not.toHaveClass("exchange-target");
    expect(screen.getByRole("button", { name: baseState.players[1].name })).toHaveClass("selectable-target", "subtle-outline");
    expect(screen.getByRole("button", { name: baseState.players[1].name })).not.toHaveClass("persistent-outline");
    expect(screen.queryByText("スキップ")).not.toBeInTheDocument();
    expect(screen.queryByText("次の手番")).not.toBeInTheDocument();
  });

  it("shows enhanced 5 confirmation for a human holder", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    const baseState = createInitialGame(3, "clockwise");
    const state: GameState = {
      ...baseState,
      phase: "handoff",
      pendingDaifugoEffect: {
        kind: "fiveEnhancementConfirm",
        effect: "fiveSkip",
        playerIndex: 0,
        continue: { shouldConfirmReach: false },
      },
      players: baseState.players.map((player, index) => (index === 0 ? { ...player, hasJEnhancementRight: true } : player)),
    };

    render(<PlayScreen state={state} dispatch={dispatch} currentRound={1} />);

    expect(screen.getByText("J強化を使用しますか？")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "はい" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "answerFiveEnhancement", useEnhancement: true });
  });

  it("shows enhanced 5 target options with immediate next disabled", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    const baseState = createInitialGame(5, "clockwise");
    const state: GameState = {
      ...baseState,
      phase: "handoff",
      pendingDaifugoEffect: {
        kind: "fiveEnhancedTargetSelect",
        effect: "fiveSkip",
        playerIndex: 0,
        continue: { shouldConfirmReach: false },
      },
      players: baseState.players.map((player, index) => (index === 0 ? { ...player, hasJEnhancementRight: true } : player)),
    };

    const { container } = render(<PlayScreen state={state} dispatch={dispatch} currentRound={1} />);

    expect(screen.getByText("次の手番を渡すプレイヤーを選択してください")).toBeInTheDocument();
    expect(screen.getByTestId("enhanced-five-target-table")).toBeInTheDocument();
    expect(screen.getByTestId("enhanced-round-table")).toBeInTheDocument();
    expect(container.querySelector(".enhanced-target-table-core span")).toBeNull();
    expect(container.querySelector(".action-panel")).toHaveClass("enhanced-target-action-panel");
    expect(container.querySelectorAll(".enhanced-target-seat-icon")).toHaveLength(5);
    expect(screen.getAllByTestId("enhanced-target-player-silhouette")).toHaveLength(5);
    expect(container.querySelector(".enhanced-target-seat-person")).toBeNull();
    expect(screen.queryByTestId("enhanced-five-turn-guide-3")).not.toBeInTheDocument();
    expect(screen.queryByText("宇宙")).not.toBeInTheDocument();
    expect(screen.getByText("通常順")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: baseState.players[0].name })).toBeDisabled();
    expect(screen.getByRole("button", { name: baseState.players[1].name })).toBeDisabled();
    expect(screen.getByRole("button", { name: baseState.players[2].name })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: baseState.players[0].name })).toHaveClass("self", "subtle-outline", "persistent-outline");
    expect(screen.getByRole("button", { name: baseState.players[1].name })).toHaveClass("disabled-target", "subtle-outline");
    expect(screen.getByRole("button", { name: baseState.players[2].name })).toHaveClass("selectable-target", "subtle-outline");
    expect(screen.getByRole("button", { name: baseState.players[2].name })).not.toHaveClass("persistent-outline");

    await user.click(screen.getByRole("button", { name: baseState.players[3].name }));
    expect(dispatch).toHaveBeenCalledWith({ type: "selectEnhancedFiveTarget", targetPlayerIndex: 3 });
  });

  it("marks enhanced 5 skip and next-turn seats on the circular table", () => {
    const baseState = createInitialGame(5, "clockwise");
    const state: GameState = {
      ...baseState,
      phase: "handoff",
      pendingDaifugoEffect: {
        kind: "fiveEnhancedTargetSelect",
        effect: "fiveSkip",
        playerIndex: 0,
        selectedTargetPlayerIndex: 3,
        continue: { shouldConfirmReach: false },
      },
      players: baseState.players.map((player, index) => (index === 0 ? { ...player, hasJEnhancementRight: true } : player)),
    };

    render(<PlayScreen state={state} dispatch={vi.fn()} currentRound={1} />);

    expect(screen.getByRole("button", { name: baseState.players[1].name })).toHaveClass("skip-target", "persistent-outline");
    expect(screen.getByRole("button", { name: baseState.players[2].name })).toHaveClass("skip-target", "persistent-outline");
    expect(screen.getByRole("button", { name: baseState.players[3].name })).toHaveClass("next-target", "persistent-outline");
    expect(screen.getByRole("button", { name: baseState.players[4].name })).not.toHaveClass("skip-target");
    expect(screen.getByRole("button", { name: baseState.players[4].name })).toHaveClass("selectable-target", "subtle-outline");
    expect(screen.getByRole("button", { name: baseState.players[4].name })).not.toHaveClass("persistent-outline");
  });

  it("marks reverse enhanced 5 seats using the current direction", () => {
    const baseState = createInitialGame(5, "counterclockwise");
    const state: GameState = {
      ...baseState,
      phase: "handoff",
      pendingDaifugoEffect: {
        kind: "fiveEnhancedTargetSelect",
        effect: "fiveSkip",
        playerIndex: 0,
        selectedTargetPlayerIndex: 2,
        continue: { shouldConfirmReach: false },
      },
      players: baseState.players.map((player, index) => (index === 0 ? { ...player, hasJEnhancementRight: true } : player)),
    };

    render(<PlayScreen state={state} dispatch={vi.fn()} currentRound={1} />);

    expect(screen.getByText("逆回り")).toBeInTheDocument();
    expect(document.querySelector(".enhanced-target-direction.counterclockwise")).toBeInTheDocument();
    expect(screen.queryByTestId("enhanced-five-turn-guide-3")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: baseState.players[4].name })).toHaveClass("skip-target");
    expect(screen.getByRole("button", { name: baseState.players[3].name })).toHaveClass("skip-target");
    expect(screen.getByRole("button", { name: baseState.players[2].name })).toHaveClass("next-target");
  });

  it("renders enhanced 5 circular table for three-player games", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    const baseState = createInitialGame(3, "clockwise");
    const state: GameState = {
      ...baseState,
      phase: "handoff",
      pendingDaifugoEffect: {
        kind: "fiveEnhancedTargetSelect",
        effect: "fiveSkip",
        playerIndex: 0,
        continue: { shouldConfirmReach: false },
      },
      players: baseState.players.map((player, index) => (index === 0 ? { ...player, hasJEnhancementRight: true } : player)),
    };

    const { container } = render(<PlayScreen state={state} dispatch={dispatch} currentRound={1} />);

    expect(screen.getByTestId("enhanced-five-target-table")).toBeInTheDocument();
    expect(container.querySelector(".action-panel")).toHaveClass("enhanced-target-action-panel--3");
    expect(screen.getAllByTestId("enhanced-target-player-silhouette")).toHaveLength(3);
    expect(screen.getByTestId("enhanced-five-turn-guide-3")).toHaveClass("clockwise");
    expect(screen.getByTestId("enhanced-five-turn-guide-3").parentElement).toHaveClass("enhanced-target-table-core");
    expect(screen.queryByTestId("enhanced-five-route-svg")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: baseState.players[0].name })).toBeDisabled();
    expect(screen.getByRole("button", { name: baseState.players[1].name })).toBeDisabled();
    expect(screen.getByRole("button", { name: baseState.players[2].name })).not.toBeDisabled();

    await user.click(screen.getByRole("button", { name: baseState.players[2].name }));
    expect(dispatch).toHaveBeenCalledWith({ type: "selectEnhancedFiveTarget", targetPlayerIndex: 2 });
  });

  it("mirrors the three-player enhanced 5 turn guide for reverse play", () => {
    const baseState = createInitialGame(3, "counterclockwise");
    const state: GameState = {
      ...baseState,
      phase: "handoff",
      pendingDaifugoEffect: {
        kind: "fiveEnhancedTargetSelect",
        effect: "fiveSkip",
        playerIndex: 0,
        continue: { shouldConfirmReach: false },
      },
      players: baseState.players.map((player, index) => (index === 0 ? { ...player, hasJEnhancementRight: true } : player)),
    };

    render(<PlayScreen state={state} dispatch={vi.fn()} currentRound={1} />);

    expect(screen.getByTestId("enhanced-five-turn-guide-3")).toHaveClass("counterclockwise");
  });

  it("uses the compact enhanced target layout for three-player enhanced 7", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    const baseState = createInitialGame(3, "clockwise");
    const state: GameState = {
      ...baseState,
      phase: "handoff",
      pendingDaifugoEffect: {
        kind: "sevenEnhancedTargetSelect",
        effect: "sevenExchange",
        playerIndex: 0,
        continue: { shouldConfirmReach: false },
      },
      players: baseState.players.map((player, index) => (index === 0 ? { ...player, hasJEnhancementRight: true } : player)),
    };

    const { container } = render(<PlayScreen state={state} dispatch={dispatch} currentRound={1} />);

    expect(screen.getByTestId("enhanced-seven-target-table")).toBeInTheDocument();
    expect(container.querySelector(".action-panel")).toHaveClass("enhanced-target-action-panel--3");
    expect(container.querySelector(".enhanced-target-select-panel")).toHaveClass("seven-enhancement-panel");
    expect(screen.getAllByTestId("enhanced-target-player-silhouette")).toHaveLength(3);
    expect(screen.queryByTestId("enhanced-five-turn-guide-3")).not.toBeInTheDocument();
    expect(screen.queryByTestId("enhanced-five-route-svg")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: baseState.players[0].name })).toBeDisabled();
    expect(screen.getByRole("button", { name: baseState.players[1].name })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: baseState.players[2].name })).not.toBeDisabled();

    await user.click(screen.getByRole("button", { name: baseState.players[2].name }));
    expect(dispatch).toHaveBeenCalledWith({ type: "selectEnhancedSevenTarget", targetPlayerIndex: 2 });
  });

  it("shows a short J enhancement splash before enhanced 5 target selection", () => {
    vi.useFakeTimers();
    const dispatch = vi.fn();
    const baseState = createInitialGame(5, "clockwise");
    const state: GameState = {
      ...baseState,
      phase: "handoff",
      pendingDaifugoEffect: {
        kind: "fiveEnhancementSplash",
        effect: "fiveSkip",
        playerIndex: 0,
        continue: { shouldConfirmReach: false },
      },
      players: baseState.players.map((player, index) => (index === 0 ? { ...player, hasJEnhancementRight: true } : player)),
    };

    render(<PlayScreen state={state} dispatch={dispatch} currentRound={1} />);

    expect(screen.getByText("J強化発動！")).toBeInTheDocument();
    expect(screen.getByText("5：スキップ強化")).toBeInTheDocument();
    expect(screen.queryByText("次の手番を渡すプレイヤーを選択してください")).not.toBeInTheDocument();

    expect(screen.getByRole("status")).toHaveStyle("--reach-splash-duration: 1350ms");

    act(() => {
      vi.advanceTimersByTime(1349);
    });

    expect(dispatch).not.toHaveBeenCalledWith({ type: "finishFiveEnhancementSplash" });

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(dispatch).toHaveBeenCalledWith({ type: "finishFiveEnhancementSplash" });
    vi.useRealTimers();
  });

  it("shows a short J enhancement splash before enhanced 7 target selection", () => {
    vi.useFakeTimers();
    const dispatch = vi.fn();
    const baseState = createInitialGame(4, "clockwise");
    const state: GameState = {
      ...baseState,
      phase: "handoff",
      pendingDaifugoEffect: {
        kind: "sevenEnhancementSplash",
        effect: "sevenExchange",
        playerIndex: 0,
        continue: { shouldConfirmReach: false },
      },
      players: baseState.players.map((player, index) => (index === 0 ? { ...player, hasJEnhancementRight: true } : player)),
    };

    render(<PlayScreen state={state} dispatch={dispatch} currentRound={1} />);

    expect(screen.getByText("J強化発動！")).toBeInTheDocument();
    expect(screen.getByText("7：交換相手選択")).toBeInTheDocument();
    expect(screen.queryByText("交換相手を選択してください")).not.toBeInTheDocument();

    expect(screen.getByRole("status")).toHaveStyle("--reach-splash-duration: 1350ms");

    act(() => {
      vi.advanceTimersByTime(1349);
    });

    expect(dispatch).not.toHaveBeenCalledWith({ type: "finishSevenEnhancementSplash" });

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(dispatch).toHaveBeenCalledWith({ type: "finishSevenEnhancementSplash" });
    vi.useRealTimers();
  });

  it("shows the normal 5 skip result in the top toolbar during handoff", () => {
    const state: GameState = {
      ...createInitialGame(3, "clockwise"),
      phase: "handoff",
      message: "Player 2をスキップ！次の手番はPlayer 3です。",
      lastDiscarderIndex: 1,
    };

    render(<PlayScreen state={state} dispatch={vi.fn()} currentRound={1} />);

    expect(screen.getByText("Player 2をスキップ！次の手番はPlayer 3です。")).toBeInTheDocument();
    expect(screen.queryByText("次のプレイヤーへ交代してください。")).not.toBeInTheDocument();
  });

  it("shows the enhanced 5 skip result in the top toolbar during handoff", () => {
    const state: GameState = {
      ...createInitialGame(5, "clockwise"),
      phase: "handoff",
      message: "Player 2、Player 3をスキップ！次の手番はPlayer 4です。",
      lastDiscarderIndex: 2,
    };

    render(<PlayScreen state={state} dispatch={vi.fn()} currentRound={1} />);

    expect(screen.getByText("Player 2、Player 3をスキップ！次の手番はPlayer 4です。")).toBeInTheDocument();
    expect(screen.queryByText("次のプレイヤーへ交代してください。")).not.toBeInTheDocument();
  });

  it("confirms a Q after-effect win only after the Q discard and draw animation finishes", async () => {
    vi.useFakeTimers();
    const dispatch = vi.fn();
    const scenario = createDebugDaifugoState("queenAfterEffectWin");
    const state = gameReducer(scenario, { type: "selectQueenVanishRank", rank: 9 });

    render(<PlayScreen state={state} dispatch={dispatch} currentRound={1} />);

    expect(state.pendingDaifugoEffect).toMatchObject({ kind: "queenWinConfirm" });
    expect(screen.getByText("プレイヤー1が9を捨てることになります。")).toBeInTheDocument();
    expect(screen.queryByText("Qの効果で上がれます。上がりますか？")).not.toBeInTheDocument();
    expect(dispatch).not.toHaveBeenCalledWith({ type: "answerQueenWin", takeWin: true });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(dispatch).toHaveBeenCalledWith({ type: "answerQueenWin", takeWin: true });
    vi.useRealTimers();
  });

  it("shows a full-size shuffled ten-card row for J information browsing", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const state: GameState = {
      ...createInitialGame(3, "clockwise"),
      phase: "handoff",
      pendingDaifugoEffect: {
        kind: "jackInspect",
        effect: "jackBack",
        playerIndex: 0,
        targetPlayerIndexes: [1, 2],
        currentTargetOffset: 0,
        revealedCardIds: {},
        continue: { shouldConfirmReach: false },
      },
    };
    const naturalOrder = state.players[1].hand.map((card) => card.id);
    const { container } = render(<PlayScreen state={state} dispatch={vi.fn()} currentRound={1} />);
    const grid = container.querySelector(".jack-inspect-card-grid");
    const panel = container.querySelector(".action-panel");
    const buttons = Array.from(grid?.querySelectorAll(".jack-inspect-card-button") ?? []);

    expect(panel).toHaveClass("jack-inspect-action-panel");
    expect(buttons).toHaveLength(10);
    expect(grid?.querySelector(".playing-card.compact")).not.toBeInTheDocument();
    expect(buttons.map((button) => button.getAttribute("data-card-id"))).not.toEqual(naturalOrder);
    randomSpy.mockRestore();
  });

  it("shows completed run options in the J shield target picker", () => {
    const baseState = createInitialGame(3, "clockwise");
    const state: GameState = {
      ...baseState,
      phase: "handoff",
      pendingDaifugoEffect: {
        kind: "jackShieldSelect",
        effect: "jackBack",
        playerIndex: 0,
        selectableRanks: [7],
        selectableRuns: [{ key: "3s|4s|5s", label: "345", ranks: [3, 4, 5], cardIds: ["3s", "4s", "5s"] }],
        continue: { shouldConfirmReach: false },
      },
      players: baseState.players.map((player, index) => (index === 0 ? { ...player, isCpu: false, type: "human" as const } : player)),
    };

    render(<PlayScreen state={state} dispatch={vi.fn()} currentRound={1} />);

    expect(screen.getByRole("button", { name: "7" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "345" })).toBeInTheDocument();
  });

  it("marks the selected J information card for the draw-style reveal animation", () => {
    const baseState = createInitialGame(3, "clockwise");
    const revealedCardId = baseState.players[1].hand[0].id;
    const state: GameState = {
      ...baseState,
      phase: "handoff",
      pendingDaifugoEffect: {
        kind: "jackInspect",
        effect: "jackBack",
        playerIndex: 0,
        targetPlayerIndexes: [1, 2],
        currentTargetOffset: 0,
        revealedCardIds: { 1: revealedCardId },
        continue: { shouldConfirmReach: false },
      },
    };

    const { container } = render(<PlayScreen state={state} dispatch={vi.fn()} currentRound={1} />);
    const revealedButton = container.querySelector(`[data-card-id="${revealedCardId}"]`);

    expect(revealedButton).toHaveClass("revealed");
    expect(revealedButton?.querySelector(".playing-card.compact")).not.toBeInTheDocument();
  });

  it("updates the round display after advancing to the next round", () => {
    const { rerender } = render(<PlayScreen state={createInitialGame(4, "clockwise")} dispatch={vi.fn()} currentRound={1} />);

    rerender(<PlayScreen state={createInitialGame(4, "clockwise")} dispatch={vi.fn()} currentRound={2} />);

    expect(screen.queryByText("- 1回戦 -")).not.toBeInTheDocument();
    expect(screen.getByText("- 2回戦 -")).toBeInTheDocument();
  });

  it.each([3, 4, 5])("uses a player-count specific table scene for %i players", (playerCount) => {
    render(<PlayScreen state={createInitialGame(playerCount, "clockwise")} dispatch={vi.fn()} currentRound={1} />);

    expect(screen.getByLabelText(`${playerCount}人用テーブル`)).toHaveClass(`table-${playerCount}`);
    expect(screen.getByText(`プレイヤー${playerCount}`)).toBeInTheDocument();
  });

  it("maps four-player online seats relative to the viewer without changing fixed slot positions", () => {
    const base = createInitialGame(4, "clockwise");
    const state: GameState = {
      ...base,
      viewerPlayerId: "p3",
      players: base.players.map((player, index) => ({ ...player, id: `p${index + 1}`, name: `Player ${index + 1}` })),
    };

    const { container } = render(<PlayScreen state={state} dispatch={vi.fn()} currentRound={1} disableLocalCpuAutomation />);

    expect(container.querySelector(".player-area.seat-bottom")?.getAttribute("data-player-id")).toBe("p3");
    expect(container.querySelector(".player-area.seat-left")?.getAttribute("data-player-id")).toBe("p4");
    expect(container.querySelector(".player-area.seat-top")?.getAttribute("data-player-id")).toBe("p1");
    expect(container.querySelector(".player-area.seat-right")?.getAttribute("data-player-id")).toBe("p2");
  });

  it("maps three-player online table cards to the same viewer-relative seats as their players", () => {
    const base = createInitialGame(3, "clockwise");
    const state: GameState = {
      ...base,
      viewerPlayerId: "p1",
      players: base.players.map((player, index) => ({
        ...player,
        id: `p${index + 1}`,
        name: `Player ${index + 1}`,
        discardPile: [card(`discard-p${index + 1}`, index + 3, "S")],
      })),
    };

    const { container } = render(<PlayScreen state={state} dispatch={vi.fn()} currentRound={1} disableLocalCpuAutomation />);

    expect(container.querySelector(".player-area.seat-bottom")?.getAttribute("data-player-id")).toBe("p1");
    expect(container.querySelector(".player-area.seat-left")?.getAttribute("data-player-id")).toBe("p2");
    expect(container.querySelector(".player-area.seat-right")?.getAttribute("data-player-id")).toBe("p3");
    expect(container.querySelector('[data-testid="discard-pile-self"] [data-card-id="discard-p1"]')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="discard-pile-left"] [data-card-id="discard-p2"]')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="discard-pile-right"] [data-card-id="discard-p3"]')).toBeInTheDocument();
  });

  it("maps five-player online seats clockwise from the viewer", () => {
    const base = createInitialGame(5, "clockwise");
    const state: GameState = {
      ...base,
      viewerPlayerId: "p3",
      players: base.players.map((player, index) => ({ ...player, id: `p${index + 1}`, name: `Player ${index + 1}` })),
    };

    const { container } = render(<PlayScreen state={state} dispatch={vi.fn()} currentRound={1} disableLocalCpuAutomation />);
    const renderedIds = [...container.querySelectorAll(".player-area")].map((area) => area.getAttribute("data-player-id"));

    expect(renderedIds).toEqual(["p5", "p1", "p2", "p3", "p4"]);
    expect(container.querySelector(".player-area.seat-bottom")?.getAttribute("data-player-id")).toBe("p3");
    expect(container.querySelector(".player-area.seat-left")?.getAttribute("data-player-id")).toBe("p4");
  });

  it("maps enhanced target table seats relative to the online viewer", () => {
    const base = createInitialGame(4, "clockwise");
    const state: GameState = {
      ...base,
      viewerPlayerId: "p2",
      phase: "handoff",
      pendingDaifugoEffect: {
        kind: "sevenEnhancedTargetSelect",
        effect: "sevenExchange",
        playerIndex: 1,
        continue: { shouldConfirmReach: false },
      },
      players: base.players.map((player, index) => ({
        ...player,
        id: `p${index + 1}`,
        name: `Player ${index + 1}`,
        type: "human",
        isCpu: false,
      })),
    };

    render(<PlayScreen state={state} dispatch={vi.fn()} currentRound={1} disableLocalCpuAutomation />);

    expect(screen.getByRole("button", { name: "Player 2" })).toHaveClass("enhanced-target-seat--4-1", "self");
    expect(screen.getByRole("button", { name: "Player 3" })).toHaveClass("enhanced-target-seat--4-2");
    expect(screen.getByRole("button", { name: "Player 4" })).toHaveClass("enhanced-target-seat--4-3");
    expect(screen.getByRole("button", { name: "Player 1" })).toHaveClass("enhanced-target-seat--4-4");
  });

  it("maps three-player enhanced target table clockwise from the online viewer", () => {
    const base = createInitialGame(3, "clockwise");
    const state: GameState = {
      ...base,
      viewerPlayerId: "p2",
      phase: "handoff",
      pendingDaifugoEffect: {
        kind: "sevenEnhancedTargetSelect",
        effect: "sevenExchange",
        playerIndex: 1,
        continue: { shouldConfirmReach: false },
      },
      players: base.players.map((player, index) => ({
        ...player,
        id: `p${index + 1}`,
        name: `Player ${index + 1}`,
        type: "human",
        isCpu: false,
      })),
    };

    render(<PlayScreen state={state} dispatch={vi.fn()} currentRound={1} disableLocalCpuAutomation />);

    expect(screen.getByRole("button", { name: "Player 2" })).toHaveClass("enhanced-target-seat--3-1", "self");
    expect(screen.getByRole("button", { name: "Player 3" })).toHaveClass("enhanced-target-seat--3-2");
    expect(screen.getByRole("button", { name: "Player 1" })).toHaveClass("enhanced-target-seat--3-3");
  });

  it("shows only the online viewer's own Q bomber discard cards in the center animation", () => {
    vi.useFakeTimers();
    const base = createInitialGame(4, "clockwise");
    const state: GameState = {
      ...base,
      viewerPlayerId: "p2",
      phase: "handoff",
      players: base.players.map((player, index) => ({ ...player, id: `p${index + 1}`, name: `Player ${index + 1}` })),
      daifugoEffectEvent: {
        id: "queenNumberVanish-test",
        kind: "queenNumberVanish",
        actorIndex: 0,
        rank: 12,
        queenDiscardResults: [
          { playerIndex: 0, discardedCards: [card("p1-q", 12, "S")], drawnCards: [] },
          { playerIndex: 1, discardedCards: [card("p2-q1", 12, "H"), card("p2-q2", 12, "D")], drawnCards: [] },
          { playerIndex: 2, discardedCards: [card("p3-q", 12, "C")], drawnCards: [] },
        ],
      },
    };

    const { container } = render(<PlayScreen state={state} dispatch={vi.fn()} currentRound={1} disableLocalCpuAutomation />);

    act(() => {
      vi.advanceTimersByTime(650);
    });

    const animatedCardIds = [...container.querySelectorAll(".daifugo-animation-cards [data-card-id]")].map((node) =>
      node.getAttribute("data-card-id"),
    );
    expect(animatedCardIds).toEqual(["p2-q1", "p2-q2"]);
    vi.useRealTimers();
  });

  it("limits seven-exchange target selection to pair cards in the online viewer hand", () => {
    const base = createInitialGame(4, "clockwise");
    const state: GameState = {
      ...base,
      viewerPlayerId: "p2",
      phase: "discard",
      currentPlayerIndex: 0,
      players: base.players.map((player, index) => ({
        ...player,
        id: `p${index + 1}`,
        name: `Player ${index + 1}`,
        hand:
          index === 1
            ? [card("p2-q1", 12, "S"), card("p2-q2", 12, "H"), card("p2-3", 3, "D"), card("p2-4", 4, "C")]
            : player.hand,
      })),
      pendingDaifugoEffect: {
        kind: "sevenExchange",
        effect: "sevenExchange",
        playerIndex: 0,
        targetPlayerIndex: 1,
        selections: {},
        continue: { shouldConfirmReach: false },
      },
    };

    render(<PlayScreen state={state} dispatch={vi.fn()} currentRound={1} disableLocalCpuAutomation />);

    const qCards = screen.getAllByTestId("hand-card").filter((button) => button.getAttribute("data-card-rank") === "Q");
    const nonPairCards = screen.getAllByTestId("hand-card").filter((button) => button.getAttribute("data-card-rank") !== "Q");
    expect(qCards).toHaveLength(2);
    expect(qCards.every((button) => !(button as HTMLButtonElement).disabled)).toBe(true);
    expect(nonPairCards.every((button) => (button as HTMLButtonElement).disabled && button.classList.contains("unselectable-card"))).toBe(true);
  });

  it("hides the bottom action panel for online viewers who are not involved in seven exchange", () => {
    const base = createInitialGame(4, "clockwise");
    const state: GameState = {
      ...base,
      viewerPlayerId: "p3",
      phase: "discard",
      currentPlayerIndex: 0,
      players: base.players.map((player, index) => ({
        ...player,
        id: `p${index + 1}`,
        name: `Player ${index + 1}`,
      })),
      pendingDaifugoEffect: {
        kind: "sevenExchange",
        effect: "sevenExchange",
        playerIndex: 0,
        targetPlayerIndex: 1,
        selections: {},
        continue: { shouldConfirmReach: false },
      },
    };

    const { container } = render(<PlayScreen state={state} dispatch={vi.fn()} currentRound={1} disableLocalCpuAutomation />);

    expect(container.querySelector(".action-panel")).not.toBeInTheDocument();
  });

  it("shows seven exchange and Q bomber center splash for uninvolved online viewers", () => {
    const base = createInitialGame(4, "clockwise");
    const players = base.players.map((player, index) => ({
      ...player,
      id: `p${index + 1}`,
      name: `Player ${index + 1}`,
    }));
    const sevenState: GameState = {
      ...base,
      viewerPlayerId: "p3",
      phase: "handoff",
      players,
      pendingDaifugoEffect: {
        kind: "sevenExchange",
        effect: "sevenExchange",
        playerIndex: 0,
        targetPlayerIndex: 1,
        selections: {},
        continue: { shouldConfirmReach: false },
      },
    };
    const { container, rerender } = render(<PlayScreen state={sevenState} dispatch={vi.fn()} currentRound={1} disableLocalCpuAutomation />);

    expect(container.querySelector(".reach-splash")).toHaveTextContent("Player 1");
    expect(container.querySelector(".reach-splash")).toHaveTextContent("カード交換!!");
    expect(container.querySelector(".action-panel")).not.toBeInTheDocument();

    const queenState: GameState = {
      ...sevenState,
      pendingDaifugoEffect: {
        kind: "queenSelect",
        effect: "queenNumberVanish",
        playerIndex: 0,
        continue: { shouldConfirmReach: false },
      },
    };
    rerender(<PlayScreen state={queenState} dispatch={vi.fn()} currentRound={1} disableLocalCpuAutomation />);

    expect(container.querySelector(".reach-splash")).toHaveTextContent("Player 1");
    expect(container.querySelector(".reach-splash")).toHaveTextContent("数字消去!!");
    expect(container.querySelector(".action-panel")).not.toBeInTheDocument();
  });

  it("shows the reach center splash when public reach status changes for online viewers", () => {
    const base = createInitialGame(4, "clockwise");
    const players = base.players.map((player, index) => ({
      ...player,
      id: `p${index + 1}`,
      name: `Player ${index + 1}`,
      isReach: false,
    }));
    const state: GameState = {
      ...base,
      viewerPlayerId: "p2",
      players,
    };
    const { container, rerender } = render(<PlayScreen state={state} dispatch={vi.fn()} currentRound={1} disableLocalCpuAutomation />);

    expect(container.querySelector(".reach-splash")).not.toBeInTheDocument();

    rerender(
      <PlayScreen
        state={{
          ...state,
          players: players.map((player, index) => (index === 0 ? { ...player, isReach: true } : player)),
        }}
        dispatch={vi.fn()}
        currentRound={1}
        disableLocalCpuAutomation
      />,
    );

    expect(container.querySelector(".reach-splash")).toHaveTextContent("Player 1");
    expect(container.querySelector(".reach-splash")).toHaveTextContent("リーチ!!");
  });

  it("shows table discard and meld placement only for three-player games", () => {
    const { rerender } = render(<PlayScreen state={createInitialGame(3, "clockwise")} dispatch={vi.fn()} currentRound={1} />);

    expect(screen.getByLabelText("捨て札と公開役")).toBeInTheDocument();

    rerender(<PlayScreen state={createInitialGame(4, "clockwise")} dispatch={vi.fn()} currentRound={1} />);
    expect(screen.queryByLabelText("捨て札と公開役")).not.toBeInTheDocument();

    rerender(<PlayScreen state={createInitialGame(5, "clockwise")} dispatch={vi.fn()} currentRound={1} />);
    expect(screen.queryByLabelText("捨て札と公開役")).not.toBeInTheDocument();
  });

  it("keeps the three-player table display and adds discard-only hover history", () => {
    const { container } = render(<PlayScreen state={createHistoryState(3)} dispatch={vi.fn()} currentRound={1} />);

    expect(container.querySelector(".table-card-layer")).toBeInTheDocument();
    expect(screen.getAllByText("過去の捨て札").length).toBeGreaterThan(0);
    expect(screen.queryByText("鳴いた役")).not.toBeInTheDocument();
    expect(screen.getAllByLabelText(/過去の捨て札/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /捨て札履歴を確認/ }).every((button) => button.textContent === "?")).toBe(true);
  });

  it("does not render a three-player hover history when there are no discards", () => {
    const { container } = render(<PlayScreen state={createInitialGame(3, "clockwise")} dispatch={vi.fn()} currentRound={1} />);

    expect(container.querySelector(".table-card-layer")).toBeInTheDocument();
    expect(screen.queryByText("まだ捨てていません")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /捨て札履歴を確認/ })).not.toBeInTheDocument();
  });

  it.each([4, 5])("shows two-column hover history markers for %i-player games", (playerCount) => {
    const { container } = render(<PlayScreen state={createHistoryState(playerCount)} dispatch={vi.fn()} currentRound={1} />);

    expect(container.querySelector(".table-card-layer")).not.toBeInTheDocument();
    expect(screen.getAllByLabelText(/履歴を確認/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /履歴を確認/ }).every((button) => button.textContent === "?")).toBe(true);
    expect(screen.getAllByText("過去の捨て札").length).toBeGreaterThan(0);
    expect(screen.getAllByText("鳴いた役").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText(/鳴いた役/).length).toBeGreaterThan(0);
  });

  it("shows empty messages in hover history when a player has no discard or meld data", () => {
    render(<PlayScreen state={createInitialGame(4, "clockwise")} dispatch={vi.fn()} currentRound={1} />);

    expect(screen.getAllByText("まだ捨てていません").length).toBeGreaterThan(0);
    expect(screen.getAllByText("まだ鳴いていません").length).toBeGreaterThan(0);
  });

  it("does not play the online deck draw animation while an effect confirmation is pending", async () => {
    const base = createInitialGame(4, "clockwise");
    const state: GameState = {
      ...base,
      viewerPlayerId: base.players[0].id,
      availableActions: ["answerDaifugoEffect"],
      stateVersion: 4,
      phase: "discard",
      drawnCard: base.players[0].hand[0],
      drawnFrom: "deck",
      pendingDaifugoEffect: {
        kind: "confirm",
        effect: "sevenExchange",
        playerIndex: 0,
        continue: { shouldConfirmReach: false },
      },
    };

    render(<PlayScreen state={state} dispatch={vi.fn()} currentRound={1} disableLocalCpuAutomation />);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByTestId("drawn-card-preview")).not.toBeInTheDocument();
  });

  it("plays the online deck draw animation for an explicit deck draw discard state", async () => {
    const base = createInitialGame(4, "clockwise");
    const state: GameState = {
      ...base,
      viewerPlayerId: base.players[0].id,
      availableActions: ["discard"],
      stateVersion: 2,
      phase: "discard",
      drawnCard: base.players[0].hand[0],
      drawnFrom: "deck",
      pendingDaifugoEffect: null,
    };

    render(<PlayScreen state={state} dispatch={vi.fn()} currentRound={1} disableLocalCpuAutomation />);

    await waitFor(() => expect(screen.getByTestId("drawn-card-preview")).toBeInTheDocument());
  });

  it("plays the online daifugo 8/10 deck draw animation from the explicit draw event", async () => {
    const base = createInitialGame(4, "clockwise");
    const drawnCard = base.players[0].hand[0];
    const state: GameState = {
      ...base,
      viewerPlayerId: base.players[0].id,
      availableActions: ["discardForDaifugoEffect"],
      stateVersion: 5,
      phase: "discard",
      drawnCard,
      drawnFrom: "deck",
      pendingDaifugoEffect: {
        kind: "extraDiscard",
        effect: "eightExtraTurn",
        playerIndex: 0,
      },
      daifugoDeckDrawEvent: {
        id: "daifugo-deck-draw-eightExtraTurn-0-test",
        playerIndex: 0,
        effect: "eightExtraTurn",
        drawSource: "deck",
        drawnCard,
      },
    };

    render(<PlayScreen state={state} dispatch={vi.fn()} currentRound={1} disableLocalCpuAutomation />);

    await waitFor(() => expect(screen.getByTestId("drawn-card-preview")).toBeInTheDocument());
  });

  it("does not play another player's online daifugo deck draw animation without the card body", async () => {
    const base = createInitialGame(4, "clockwise");
    const state: GameState = {
      ...base,
      viewerPlayerId: base.players[1].id,
      availableActions: [],
      stateVersion: 5,
      phase: "discard",
      drawnCard: null,
      drawnFrom: "deck",
      pendingDaifugoEffect: {
        kind: "extraDiscard",
        effect: "eightExtraTurn",
        playerIndex: 0,
      },
      daifugoDeckDrawEvent: {
        id: "daifugo-deck-draw-eightExtraTurn-0-test",
        playerIndex: 0,
        effect: "eightExtraTurn",
        drawSource: "deck",
        drawnCard: null,
      },
    };

    render(<PlayScreen state={state} dispatch={vi.fn()} currentRound={1} disableLocalCpuAutomation />);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByTestId("drawn-card-preview")).not.toBeInTheDocument();
  });

  it("lets an online seven-exchange participant select before the other participant has selected", async () => {
    vi.useFakeTimers();
    const dispatch = vi.fn();
    const base = createInitialGame(4, "clockwise");
    const state: GameState = {
      ...base,
      viewerPlayerId: base.players[1].id,
      stateVersion: 7,
      currentPlayerIndex: 0,
      phase: "discard",
      players: base.players.map((player, index) => ({ ...player, name: ["Alice", "Bob", "Carol", "Dave"][index] })),
      pendingDaifugoEffect: {
        kind: "sevenExchange",
        effect: "sevenExchange",
        playerIndex: 0,
        targetPlayerIndex: 1,
        selections: {},
        continue: { shouldConfirmReach: false },
      },
    };

    try {
      render(<PlayScreen state={state} dispatch={dispatch} currentRound={1} disableLocalCpuAutomation />);

      expect(screen.getAllByText("相手に渡すカードを1枚選択してください。").length).toBeGreaterThan(0);
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      const selectableCard = screen.getAllByTestId("hand-card").find((button) => !(button as HTMLButtonElement).disabled) as HTMLButtonElement | undefined;
      expect(selectableCard).toBeTruthy();
      fireEvent.click(selectableCard!);
      expect(selectableCard).toHaveClass("selected-card");
      const confirm = screen.getByTestId("seven-exchange-confirm-button");
      expect(confirm).toBeEnabled();
      fireEvent.click(confirm);
      act(() => vi.advanceTimersByTime(650));
      expect(dispatch).toHaveBeenCalledWith({
        type: "selectSevenExchangeCard",
        playerIndex: 1,
        cardId: selectableCard!.dataset.cardId,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("closes the seven-exchange selection controls after the online viewer has selected", () => {
    const base = createInitialGame(4, "clockwise");
    const state: GameState = {
      ...base,
      viewerPlayerId: base.players[0].id,
      stateVersion: 7,
      currentPlayerIndex: 0,
      phase: "discard",
      players: base.players.map((player, index) => ({ ...player, name: ["Alice", "Bob", "Carol", "Dave"][index] })),
      pendingDaifugoEffect: {
        kind: "sevenExchange",
        effect: "sevenExchange",
        playerIndex: 0,
        targetPlayerIndex: 1,
        selections: { 0: "__selected__" },
        continue: { shouldConfirmReach: false },
      },
    };

    render(<PlayScreen state={state} dispatch={vi.fn()} currentRound={1} disableLocalCpuAutomation />);

    expect(screen.getAllByText("Bobが渡すカードを選択しています。").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("seven-exchange-confirm-button")).not.toBeInTheDocument();
  });

  it("keeps third-party online viewers read-only during seven exchange", () => {
    const base = createInitialGame(4, "clockwise");
    const state: GameState = {
      ...base,
      viewerPlayerId: base.players[2].id,
      stateVersion: 7,
      currentPlayerIndex: 0,
      phase: "discard",
      players: base.players.map((player, index) => ({ ...player, name: ["Alice", "Bob", "Carol", "Dave"][index] })),
      pendingDaifugoEffect: {
        kind: "sevenExchange",
        effect: "sevenExchange",
        playerIndex: 0,
        targetPlayerIndex: 1,
        selections: { 0: "__selected__" },
        continue: { shouldConfirmReach: false },
      },
    };

    render(<PlayScreen state={state} dispatch={vi.fn()} currentRound={1} disableLocalCpuAutomation />);

    expect(screen.getAllByText("AliceとBobが互いに渡すカードを選択しています。").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("hand-card").every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
    expect(screen.queryByTestId("seven-exchange-confirm-button")).not.toBeInTheDocument();
  });
});
