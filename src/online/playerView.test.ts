import { describe, expect, it } from "vitest";
import { createPlayerViewState } from "./playerView";
import { createSingleRonResultFixture } from "../game/resultFixtures";
import { createInitialGame } from "../game/gameState";

describe("createPlayerViewState", () => {
  it("keeps opponent hands masked during play but reveals public result cards on the result screen", () => {
    const resultState = createSingleRonResultFixture();
    const viewerId = resultState.players[1].id;
    const playingView = createPlayerViewState({ ...resultState, phase: "discard", result: null }, viewerId);

    expect(playingView.players[0].hand.every((card) => card.rank === 0 && String(card.id).startsWith("hidden-hand-"))).toBe(true);

    const resultView = createPlayerViewState(resultState, viewerId);
    expect(resultView.players[0].hand.some((card) => card.rank > 0)).toBe(true);
    expect(resultView.players.flatMap((player) => player.hand).every((card) => card.rank !== 0)).toBe(true);
    expect(resultView.result?.winningResult.melds.flat().every((card) => card.rank !== 0)).toBe(true);
  });

  it("shows Q selection as public status without granting non-actor actions", () => {
    const base = createInitialGame(4, "clockwise");
    const state = {
      ...base,
      pendingDaifugoEffect: {
        kind: "queenSelect" as const,
        effect: "queenNumberVanish" as const,
        playerIndex: 0,
        continue: { shouldConfirmReach: false },
      },
    };

    const actorView = createPlayerViewState(state, base.players[0].id);
    const otherView = createPlayerViewState(state, base.players[1].id);

    expect(actorView.pendingDaifugoEffect?.kind).toBe("queenSelect");
    expect(actorView.availableActions).toContain("selectQueenVanishRank");
    expect(otherView.pendingDaifugoEffect?.kind).toBe("queenSelect");
    expect(otherView.availableActions).not.toContain("selectQueenVanishRank");
    expect(otherView.queenVanishRankOptions).toBeUndefined();
  });
});
