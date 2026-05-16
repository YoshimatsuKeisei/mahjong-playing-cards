import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import HomeScreen from "./HomeScreen";

describe("HomeScreen debug result actions", () => {
  it("shows DEV result fixture buttons and calls the selected action", async () => {
    const user = userEvent.setup();
    const onDebugPointsTsumo = vi.fn();

    render(
      <HomeScreen
        entryMode="initial"
        onNavigate={vi.fn()}
        debugResultActions={[
          { label: "Debug Rounds Ron", onClick: vi.fn() },
          { label: "Debug Target Tsumo", onClick: vi.fn() },
          { label: "Debug Points Tsumo", onClick: onDebugPointsTsumo },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Debug Points Tsumo" }));

    expect(screen.getByRole("button", { name: "Debug Rounds Ron" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Debug Target Tsumo" })).toBeInTheDocument();
    expect(onDebugPointsTsumo).toHaveBeenCalledTimes(1);
  });
});
