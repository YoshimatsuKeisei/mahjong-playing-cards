import { expect, test } from "@playwright/test";
import { setupFourPlayerOnlineGame } from "./online-helpers";

test("online call button submits takeDiscard and publishes open melds", async ({ browser }) => {
  const { pages } = await setupFourPlayerOnlineGame(browser, "online-call-basic");
  const [host, caller, player3, player4] = pages;

  await expect(caller.getByTestId("call-button")).toBeVisible();
  for (const page of [host, player3, player4]) {
    await expect(page.getByTestId("call-button")).toHaveCount(0);
  }

  await caller.getByTestId("call-button").first().click();
  await expect(caller.getByTestId("play-screen")).toHaveAttribute("data-phase", "discard");
  await expect(caller.getByTestId("play-screen")).toHaveAttribute("data-current-player-id", "player-2");
  await Promise.all(
    pages.map((page) =>
      expect(page.getByTestId("player-area").filter({ hasText: "Player 2" })).toHaveAttribute("data-open-meld-count", "1"),
    ),
  );

  await Promise.all(pages.map((page) => page.close()));
});
