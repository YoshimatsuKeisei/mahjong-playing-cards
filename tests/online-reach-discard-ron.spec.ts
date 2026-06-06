import { expect, test } from "@playwright/test";
import { getDrawnCardLabel, setupFourPlayerOnlineGame } from "./online-helpers";

test("online reached discardDrawnOnly can feed ron reaction", async ({ browser }) => {
  const { pages } = await setupFourPlayerOnlineGame(browser, "online-reach-discard-ron");
  const [host, ronPlayer, player3, player4] = pages;

  await host.getByTestId("draw-from-deck-button").click();
  await getDrawnCardLabel(host);
  await expect(host.getByTestId("drawn-card-preview")).toBeHidden({ timeout: 5_000 });
  await host.getByTestId("discard-drawn-only-button").click();

  await expect(ronPlayer.getByTestId("ron-button")).toBeVisible();
  for (const page of [host, player3, player4]) {
    await expect(page.getByTestId("ron-button")).toHaveCount(0);
  }

  await ronPlayer.getByTestId("ron-button").click();
  await Promise.all(pages.map((page) => expect(page.getByTestId("result-screen")).toBeVisible()));

  await Promise.all(pages.map((page) => page.close()));
});
