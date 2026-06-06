import { expect, test } from "@playwright/test";
import { getDrawnCardLabel, setupFourPlayerOnlineGame } from "./online-helpers";

test("online reached player discards only the drawn card when unable to tsumo", async ({ browser }) => {
  const { pages } = await setupFourPlayerOnlineGame(browser, "online-reach-discard-drawn-only");
  const [host, player2] = pages;

  await host.getByTestId("draw-from-deck-button").click();
  const drawnLabel = await getDrawnCardLabel(host);
  await expect(host.getByTestId("drawn-card-preview")).toBeHidden({ timeout: 5_000 });
  await expect(host.getByTestId("tsumo-button")).toHaveCount(0);
  await expect(host.getByTestId("discard-drawn-only-button")).toBeVisible();
  await expect(host.getByTestId("discard-button")).toHaveCount(0);

  await host.getByTestId("discard-drawn-only-button").click();
  await expect(player2.getByTestId("draw-from-deck-button")).toBeVisible({ timeout: 10_000 });
  const publicDiscardLabels = await player2.getByTestId("public-discard-card").evaluateAll((cards) =>
    cards.map((card) => card.getAttribute("data-card-label") ?? ""),
  );
  expect(publicDiscardLabels).toContain(drawnLabel);

  await Promise.all(pages.map((page) => page.close()));
});
