import { expect, test } from "@playwright/test";
import { setupFourPlayerOnlineGame } from "./online-helpers";

test("online call candidates do not show Pass and drawing from deck advances without stalling", async ({ browser }) => {
  const { pages } = await setupFourPlayerOnlineGame(browser, "online-call-basic");
  const [, caller] = pages;

  await expect(caller.getByTestId("call-button")).toBeVisible();
  await expect(caller.getByRole("button", { name: "Pass" })).toHaveCount(0);
  await caller.getByTestId("draw-from-deck-button").click();

  await expect(caller.getByTestId("drawn-card-preview")).toBeHidden({ timeout: 5_000 });
  await expect(caller.getByTestId("play-screen")).toHaveAttribute("data-phase", "discard");
  await expect(caller.getByTestId("deck-remaining").first()).toHaveText("103");
  await expect(caller.getByTestId("call-button")).toHaveCount(0);

  await Promise.all(pages.map((page) => page.close()));
});
