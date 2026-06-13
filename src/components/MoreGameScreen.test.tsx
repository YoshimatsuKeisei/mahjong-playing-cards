import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import MoreGameScreen from "./MoreGameScreen";

describe("MoreGameScreen", () => {
  it("shows resumable temporary leave games and resumes one", async () => {
    const user = userEvent.setup();
    const onResume = vi.fn();
    const game = {
      roomId: "ROOM1",
      roomName: "テストルーム",
      playerId: "player-1",
      playerName: "Player1: Guest Player",
      resumeToken: "token-1",
      mode: "cpuSubstitute" as const,
      expiresAt: Date.now() + 12 * 60 * 1000,
      currentRound: 2,
      matchType: "rounds" as const,
      totalPlayers: 4,
      convertedToCpu: false,
    };

    render(
      <MoreGameScreen
        resumableGames={[game]}
        onResume={onResume}
        onRefresh={vi.fn()}
        onBackHome={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "復帰できる試合" })).toBeInTheDocument();
    expect(screen.getByText("テストルーム")).toBeInTheDocument();
    expect(screen.getByText("CPU代行中")).toBeInTheDocument();
    expect(screen.getByText("2局目")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "復帰" }));
    expect(onResume).toHaveBeenCalledWith(game);
  });

  it("shows one card per room when multiple resume entries share a room", () => {
    const baseGame = {
      roomId: "ROOM1",
      roomName: "Duplicate Room",
      playerId: "player-1",
      playerName: "Player1",
      resumeToken: "token-1",
      mode: "pause" as const,
      expiresAt: Date.now() + 5 * 60 * 1000,
      currentRound: 1,
      matchType: "rounds" as const,
      totalPlayers: 4,
      convertedToCpu: false,
    };

    render(
      <MoreGameScreen
        resumableGames={[
          baseGame,
          {
            ...baseGame,
            playerId: "player-2",
            playerName: "Player2",
            resumeToken: "token-2",
            expiresAt: baseGame.expiresAt + 60 * 1000,
          },
        ]}
        onResume={vi.fn()}
        onRefresh={vi.fn()}
        onBackHome={vi.fn()}
      />,
    );

    expect(screen.getAllByText("Duplicate Room")).toHaveLength(1);
  });
});
