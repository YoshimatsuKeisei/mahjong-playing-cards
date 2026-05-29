import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    expect(screen.getByRole("button", { name: /Jバック/ })).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: /Jバック/ })).not.toBeDisabled();
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

    render(<PlayScreen state={state} dispatch={dispatch} currentRound={1} />);

    expect(screen.getByText("交換相手を選択してください")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "プレイヤー1" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "プレイヤー2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "プレイヤー3" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "プレイヤー4" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "プレイヤー4" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "selectEnhancedSevenTarget", targetPlayerIndex: 3 });
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

    render(<PlayScreen state={state} dispatch={dispatch} currentRound={1} />);

    expect(screen.getByText("次の手番を渡すプレイヤーを選択してください")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: baseState.players[0].name })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: baseState.players[1].name })).toBeDisabled();
    expect(screen.getByRole("button", { name: baseState.players[2].name })).not.toBeDisabled();

    await user.click(screen.getByRole("button", { name: baseState.players[3].name }));
    expect(dispatch).toHaveBeenCalledWith({ type: "selectEnhancedFiveTarget", targetPlayerIndex: 3 });
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
