import { expect, test } from "@playwright/test";
import { setupFourPlayerOnlineGame } from "./online-helpers";

test("online double ron preserves multiple winners", async ({ browser }) => {
  const { pages } = await setupFourPlayerOnlineGame(browser, "online-double-ron");
  const [discarder, ronPlayer1, ronPlayer2, player4] = pages;

  await discarder.locator('[data-testid="hand-card"][data-card-id="ron-discard-k"]').click();
  await discarder.getByTestId("discard-button").click();

  await expect(ronPlayer1.getByTestId("ron-button")).toBeVisible();
  await expect(ronPlayer2.getByTestId("ron-button")).toBeVisible();
  await expect(discarder.getByTestId("ron-button")).toHaveCount(0);
  await expect(player4.getByTestId("ron-button")).toHaveCount(0);

  await ronPlayer1.getByTestId("ron-button").click();
  await Promise.all(pages.map((page) => expect(page.getByTestId("result-screen")).toBeVisible()));
  await expect(ronPlayer1.getByTestId("result-player-row").filter({ hasText: "勝者" })).toHaveCount(2);

  await Promise.all(pages.map((page) => page.close()));
});
