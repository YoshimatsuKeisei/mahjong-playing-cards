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
});
