import { expect, test } from "@playwright/test";
import { createOnlineRoom, joinOnlineRoom } from "./online-helpers";

test("four players can create, join, ready, start, and receive hidden online views", async ({ browser }) => {
  const pages = await Promise.all(Array.from({ length: 4 }, () => browser.newPage()));
  const roomId = await createOnlineRoom(pages[0], "Player 1");

  for (let index = 1; index < pages.length; index += 1) {
    await joinOnlineRoom(pages[index], roomId, `Player ${index + 1}`);
    await expect(pages[index].getByTestId("start-game-button")).toHaveCount(0);
    await pages[index].getByTestId("ready-button").click();
  }

  await expect(pages[0].getByTestId("start-game-button")).toBeEnabled();
  await pages[0].getByTestId("start-game-button").click();

  for (const page of pages) {
    await expect(page.getByTestId("play-screen")).toBeVisible();
    await expect(page.getByTestId("deck-remaining").first()).toHaveText("104");
    await expect(page.getByTestId("hand-card")).toHaveCount(10);
    await expect(page.getByTestId("deck-stack").locator("[data-card-id]")).toHaveCount(0);
  }

  await Promise.all(pages.map((page) => page.close()));
});
