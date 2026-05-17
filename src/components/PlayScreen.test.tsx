import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createInitialGame } from "../game/gameState";
import PlayScreen from "./PlayScreen";

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
});
