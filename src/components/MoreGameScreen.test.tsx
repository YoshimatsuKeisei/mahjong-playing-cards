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
});
