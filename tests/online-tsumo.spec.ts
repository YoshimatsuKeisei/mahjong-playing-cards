import { expect, test } from "@playwright/test";
import { getDrawnCardLabel, setupFourPlayerOnlineGame } from "./online-helpers";

test("online normal tsumo is accepted by the server", async ({ browser }) => {
  const { pages } = await setupFourPlayerOnlineGame(browser, "online-tsumo-basic");
  const [host, player2, player3, player4] = pages;

  await host.getByTestId("draw-from-deck-button").click();
  await getDrawnCardLabel(host);
  await expect(host.getByTestId("drawn-card-preview")).toBeHidden({ timeout: 5_000 });
  await expect(host.getByTestId("tsumo-button").first()).toBeVisible();
  for (const page of [player2, player3, player4]) {
    await expect(page.getByTestId("tsumo-button")).toHaveCount(0);
  }

  await host.getByTestId("tsumo-button").first().click();
  await Promise.all(pages.map((page) => expect(page.getByTestId("result-screen")).toBeVisible()));
  await expect(host.getByTestId("result-player-row").filter({ hasText: "勝者" })).toHaveCount(1);

  await Promise.all(pages.map((page) => page.close()));
});
