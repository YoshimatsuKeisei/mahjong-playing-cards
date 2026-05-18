import { render, screen } from "@testing-library/react";
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
