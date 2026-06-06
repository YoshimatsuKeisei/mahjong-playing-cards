import { expect, test } from "@playwright/test";
import { setupFourPlayerOnlineGame } from "./online-helpers";

test("online reach ron candidate can answer Ron and reach result", async ({ browser }) => {
  const { pages } = await setupFourPlayerOnlineGame(browser, "online-ron-basic");
  const [discarder, ronPlayer, player3, player4] = pages;

  await discarder.locator('[data-testid="hand-card"][data-card-id="ron-discard-k"]').click();
  await discarder.getByTestId("discard-button").click();

  await expect(ronPlayer.getByTestId("ron-button")).toBeVisible();
  for (const page of [discarder, player3, player4]) {
    await expect(page.getByTestId("ron-button")).toHaveCount(0);
  }

  await ronPlayer.getByTestId("ron-button").click();
  await Promise.all(pages.map((page) => expect(page.getByTestId("result-screen")).toBeVisible()));
  await expect(ronPlayer.getByTestId("result-player-row").filter({ hasText: "勝者" })).toHaveCount(1);

  await Promise.all(pages.map((page) => page.close()));
});
