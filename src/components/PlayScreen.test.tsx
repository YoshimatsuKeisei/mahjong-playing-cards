import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { createInitialGame } from "../game/gameState";
import type { Card, GameState } from "../types";
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

describe("PlayScreen round display", () => {
  it("shows the current round on the play screen", () => {
    render(<PlayScreen state={createInitialGame(4, "clockwise")} dispatch={vi.fn()} currentRound={1} />);

    expect(screen.getByText("- 1回戦 -")).toBeInTheDocument();
  });

  it("renders the direct home exit action only when provided", async () => {
    const user = userEvent.setup();
    const onExitToHome = vi.fn();
    const { rerender } = render(<PlayScreen state={createInitialGame(4, "clockwise")} dispatch={vi.fn()} currentRound={1} />);

    expect(screen.queryByRole("button", { name: "退出" })).not.toBeInTheDocument();

    rerender(<PlayScreen state={createInitialGame(4, "clockwise")} dispatch={vi.fn()} currentRound={1} onExitToHome={onExitToHome} />);
    await user.click(screen.getByRole("button", { name: "退出" }));

    expect(onExitToHome).toHaveBeenCalledTimes(1);
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
});
