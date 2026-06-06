import { expect, test } from "@playwright/test";
import { setupFourPlayerOnlineGame } from "./online-helpers";

test("online reach candidate is actor-only and declaration becomes public", async ({ browser }) => {
  const { pages } = await setupFourPlayerOnlineGame(browser, "online-reach-declare");
  const [host, player2, player3, player4] = pages;

  await expect(host.getByTestId("reach-button")).toBeVisible();
  for (const page of [player2, player3, player4]) {
    await expect(page.getByTestId("reach-button")).toHaveCount(0);
  }

  await host.getByTestId("reach-button").click();
  await expect(host.getByTestId("play-screen")).toHaveAttribute("data-state-version", "1");
  await Promise.all(
    pages.map((page) =>
      expect(page.getByTestId("player-area").filter({ hasText: "Player 1" })).toHaveAttribute("data-is-reach", "true"),
    ),
  );

  await Promise.all(pages.map((page) => page.close()));
});
