import { expect, test } from "@playwright/test";
import { setupFourPlayerOnlineGame } from "./online-helpers";

test("online call pass advances by drawing from deck without stalling", async ({ browser }) => {
  const { pages } = await setupFourPlayerOnlineGame(browser, "online-call-basic");
  const [, caller] = pages;

  await expect(caller.getByTestId("call-button")).toBeVisible();
  await expect(caller.getByTestId("reaction-pass-button")).toBeVisible();
  await caller.getByTestId("reaction-pass-button").click();

  await expect(caller.getByTestId("drawn-card-preview")).toBeHidden({ timeout: 5_000 });
  await expect(caller.getByTestId("play-screen")).toHaveAttribute("data-phase", "discard");
  await expect(caller.getByTestId("deck-remaining").first()).toHaveText("103");
  await expect(caller.getByTestId("call-button")).toHaveCount(0);

  await Promise.all(pages.map((page) => page.close()));
});
