import { expect, test } from "@playwright/test";
import { getCardLabels, getDrawnCardLabel, setupFourPlayerOnlineGame } from "./online-helpers";

test("online draw and discard advance one server-authoritative turn", async ({ browser }) => {
  const { pages } = await setupFourPlayerOnlineGame(browser);
  const [host, player2, player3, player4] = pages;

  await expect(host.getByTestId("draw-from-deck-button")).toBeVisible();
  for (const page of [player2, player3, player4]) {
    await expect(page.getByTestId("draw-from-deck-button")).toHaveCount(0);
  }

  const hostCardsBefore = await getCardLabels(host);
  await host.getByTestId("draw-from-deck-button").click();
  const drawnLabel = await getDrawnCardLabel(host);
  await expect(player2.getByTestId("drawn-card")).toHaveCount(0);
  await expect(host.getByTestId("deck-remaining").first()).toHaveText("103");
  await expect(host.getByTestId("drawn-card-preview")).toBeHidden({ timeout: 5_000 });
  await expect(host.getByTestId("hand-card")).toHaveCount(hostCardsBefore.length + 1);
  const hostCardsAfterDraw = await getCardLabels(host);
  expect(hostCardsAfterDraw.some((card) => card.label === drawnLabel)).toBe(true);
  await expect(host.getByTestId("discard-button")).toBeVisible();

  const discardCard = host.getByTestId("hand-card").first();
  const discardedLabel = (await discardCard.getAttribute("data-card-label")) ?? "";
  await expect(discardCard).toBeEnabled();
  await discardCard.click();
  await expect(host.getByTestId("discard-button")).toBeEnabled();
  await host.getByTestId("discard-button").click();
  await expect(host.getByTestId("play-screen")).toHaveAttribute("data-state-version", "2");
  await expect(host.getByTestId("play-screen")).toHaveAttribute("data-phase", "draw");
  await expect(host.getByTestId("public-discard-card").first()).toHaveAttribute("data-card-label", discardedLabel);

  for (const page of pages) {
    await expect(page.getByTestId("public-discard-card").first()).toHaveAttribute("data-card-id", /.+/);
    const publicDiscardLabels = await page.getByTestId("public-discard-card").evaluateAll((cards) =>
      cards.map((card) => card.getAttribute("data-card-label") ?? ""),
    );
    expect(publicDiscardLabels).toContain(discardedLabel);
  }

  await expect(player2.getByTestId("draw-from-deck-button")).toBeVisible();
  await expect(host.getByTestId("draw-from-deck-button")).toHaveCount(0);

  await Promise.all(pages.map((page) => page.close()));
});

test("offline draw animation still shows the drawn card before it enters the hand", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("home-menu-newGame").click();
  await page.getByTestId("local-create-room-choice").click();
  await page.getByTestId("offline-start-button").click();
  await expect(page.getByTestId("play-screen")).toBeVisible();
  await expect(page.getByTestId("deck-remaining").first()).toHaveText("104");
  await expect(page.getByRole("button", { name: "Pass" })).toHaveCount(0);

  const before = await getCardLabels(page);
  await page.getByTestId("draw-from-deck-button").click();
  const drawnLabel = await getDrawnCardLabel(page);
  await expect(page.getByTestId("drawn-card-preview")).toBeHidden({ timeout: 5_000 });
  await expect(page.getByTestId("hand-card")).toHaveCount(before.length + 1);
  const after = await getCardLabels(page);
  expect(after.some((card) => card.label === drawnLabel)).toBe(true);
});
