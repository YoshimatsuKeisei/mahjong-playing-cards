import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { GameState } from "../types";
import { createInitialGame } from "../game/gameState";
import { createDoubleRonResultFixture } from "../game/resultFixtures";
import ResultScreen from "./ResultScreen";

function createResultState(): GameState {
  const state = createInitialGame(4, "clockwise");
  return {
    ...state,
    phase: "result",
    winner: 0,
    result: {
      winnerIndex: 0,
      winType: "tsumo",
      winningResult: {
        canWin: true,
        melds: [],
        keyCard: state.players[0].hand[0],
      },
      score: {
        winnerScore: 1000,
        playerLosses: [1, 5, 6, 7],
      },
      discarderIndex: null,
    },
  };
}

describe("ResultScreen round controls", () => {
  it("shows the current round in the result header", () => {
    const { rerender } = render(
      <ResultScreen state={createResultState()} currentRound={1} totalRounds={3} onNextRound={vi.fn()} onRestart={vi.fn()} onBackHome={vi.fn()} />,
    );

    expect(screen.getByText("1回戦")).toBeInTheDocument();

    rerender(
      <ResultScreen state={createResultState()} currentRound={2} totalRounds={3} onNextRound={vi.fn()} onRestart={vi.fn()} onBackHome={vi.fn()} />,
    );

    expect(screen.queryByText("1回戦")).not.toBeInTheDocument();
    expect(screen.getByText("2回戦")).toBeInTheDocument();
  });

  it("shows the next round button before the final round", () => {
    render(
      <ResultScreen state={createResultState()} currentRound={1} totalRounds={3} onNextRound={vi.fn()} onRestart={vi.fn()} onBackHome={vi.fn()} />,
    );

    expect(screen.getByRole("button", { name: "2回戦に進む" })).toBeInTheDocument();
  });

  it("hides the next round button on the final round", () => {
    render(
      <ResultScreen state={createResultState()} currentRound={3} totalRounds={3} onNextRound={undefined} onRestart={vi.fn()} onBackHome={vi.fn()} />,
    );

    expect(screen.queryByRole("button", { name: "4回戦に進む" })).not.toBeInTheDocument();
  });

  it("calls the next round handler when the next round button is clicked", async () => {
    const user = userEvent.setup();
    const onNextRound = vi.fn();
    render(
      <ResultScreen state={createResultState()} currentRound={1} totalRounds={3} onNextRound={onNextRound} onRestart={vi.fn()} onBackHome={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: "2回戦に進む" }));

    expect(onNextRound).toHaveBeenCalledTimes(1);
  });

  it("moves the old restart behavior to the quit button", async () => {
    const user = userEvent.setup();
    const onRestart = vi.fn();
    render(
      <ResultScreen state={createResultState()} currentRound={1} totalRounds={3} onNextRound={vi.fn()} onRestart={onRestart} onBackHome={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: "やめる" }));

    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  it("keeps the home button behavior unchanged", async () => {
    const user = userEvent.setup();
    const onBackHome = vi.fn();
    render(
      <ResultScreen state={createResultState()} currentRound={1} totalRounds={3} onNextRound={vi.fn()} onRestart={vi.fn()} onBackHome={onBackHome} />,
    );

    await user.click(screen.getByRole("button", { name: "ホーム画面に戻る" }));

    expect(onBackHome).toHaveBeenCalledTimes(1);
  });

  it("shows raw points without multiplying by 100 in target-score mode", () => {
    const state = createResultState();
    state.result = {
      ...state.result!,
      winType: "ron",
      score: { winnerScore: 1900, playerLosses: [10, 29, 3, 5] },
      discarderIndex: 1,
    };

    render(
      <ResultScreen
        state={state}
        currentRound={1}
        useRawScore
        onNextRound={vi.fn()}
        onRestart={vi.fn()}
        onBackHome={vi.fn()}
      />,
    );

    expect(screen.getByText("19点")).toBeInTheDocument();
    expect(screen.queryByText("1900点")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2回戦に進む" })).toBeInTheDocument();
  });

  it("shows the double-ron fixture losses and formulas consistently", () => {
    const state = createDoubleRonResultFixture();

    const { container } = render(<ResultScreen state={state} useRawScore onRestart={vi.fn()} onBackHome={vi.fn()} />);
    const rows = container.querySelectorAll(".player-result-row");

    expect(rows[0].querySelector(".player-result-score strong")?.textContent).toBe("7");
    expect(rows[1].querySelector(".player-result-score strong")?.textContent).toBe("28");
    expect(rows[2].querySelector(".player-result-score strong")?.textContent).toBe("5");
    expect(rows[2].querySelector(".player-result-score strong")?.textContent).not.toBe("16");
    expect(screen.queryByText("16")).not.toBeInTheDocument();

    const formulaRows = Array.from(container.querySelectorAll(".formula-expression")).map((item) => item.textContent ?? "");
    expect(formulaRows.some((text) => text.includes("28") && text.includes("7") && text.includes("21"))).toBe(true);
    expect(formulaRows.some((text) => text.includes("28") && text.includes("5") && text.includes("23"))).toBe(true);
  });
});
