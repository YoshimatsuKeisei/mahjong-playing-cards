import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createInitialGame } from "../game/gameState";
import type { GameState } from "../types";
import PlayScreen from "./PlayScreen";

describe("PlayScreen queen effect choices", () => {
  it("does not show vanished Q ranks as human queen effect choices", () => {
    const state: GameState = {
      ...createInitialGame(3, "clockwise"),
      queenVanishedRanks: [13],
      pendingDaifugoEffect: {
        kind: "queenSelect",
        effect: "queenNumberVanish",
        playerIndex: 0,
        continue: { shouldConfirmReach: false },
      },
    };
    const { container } = render(<PlayScreen state={state} dispatch={vi.fn()} currentRound={1} />);
    const rankChoices = [...container.querySelectorAll<HTMLButtonElement>(".rank-choice-button")].map((button) => button.textContent);

    expect(rankChoices).not.toContain("K");
    expect(rankChoices).toContain("Q");
  });

  it("centers available Q choices and disables ranks that cannot be refilled", () => {
    const state: GameState = {
      ...createInitialGame(3, "clockwise"),
      deck: [{ id: "deck-5", rank: 5, suit: "S" }],
      players: [
        {
          ...createInitialGame(3, "clockwise").players[0],
          hand: [
            { id: "5s", rank: 5, suit: "S" },
            { id: "5h", rank: 5, suit: "H" },
          ],
        },
        createInitialGame(3, "clockwise").players[1],
        createInitialGame(3, "clockwise").players[2],
      ],
      queenVanishedRanks: [13, 12],
      pendingDaifugoEffect: {
        kind: "queenSelect",
        effect: "queenNumberVanish",
        playerIndex: 0,
        continue: { shouldConfirmReach: false },
      },
    };
    const { container } = render(<PlayScreen state={state} dispatch={vi.fn()} currentRound={1} />);
    const grid = container.querySelector<HTMLElement>(".rank-choice-grid");
    const fiveButton = [...container.querySelectorAll<HTMLButtonElement>(".rank-choice-button")].find((button) => button.textContent === "5");
    const kingButton = [...container.querySelectorAll<HTMLButtonElement>(".rank-choice-button")].find((button) => button.textContent === "K");

    expect(grid).toBeTruthy();
    expect(fiveButton?.disabled).toBe(true);
    expect(kingButton).toBeUndefined();
  });
});
