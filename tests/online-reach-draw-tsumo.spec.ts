import { expect, test } from "@playwright/test";
import { getDrawnCardLabel, setupFourPlayerOnlineGame } from "./online-helpers";

test("online reached player can tsumo after drawing", async ({ browser }) => {
  const { pages } = await setupFourPlayerOnlineGame(browser, "online-reach-draw-tsumo");
  const [host, player2] = pages;

  await host.getByTestId("draw-from-deck-button").click();
  await getDrawnCardLabel(host);
  await expect(host.getByTestId("drawn-card-preview")).toBeHidden({ timeout: 5_000 });
  await expect(host.getByTestId("tsumo-button").first()).toBeVisible();
  await expect(player2.getByTestId("tsumo-button")).toHaveCount(0);

  await host.getByTestId("tsumo-button").first().click();
  await Promise.all(pages.map((page) => expect(page.getByTestId("result-screen")).toBeVisible()));

  await Promise.all(pages.map((page) => page.close()));
});
