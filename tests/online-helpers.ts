import { expect, type Browser, type Page } from "@playwright/test";

export interface OnlineGameSetup {
  pages: Page[];
  roomId: string;
}

export async function openOnlineLobby(page: Page, playerName: string) {
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") {
      console.log(`[${playerName}] ${message.type()}: ${message.text()}`);
    }
  });
  await page.goto("/");
  await page.getByTestId("home-menu-newGame").click();
  await page.getByTestId("online-join-room-choice").click();
  await page.getByTestId("player-name-input").fill(playerName);
}

export async function createOnlineRoom(page: Page, playerName = "Player 1") {
  await openOnlineLobby(page, playerName);
  await page.getByTestId("create-room-button").click();
  await expect(page.getByTestId("room-id")).toBeVisible();
  const roomText = (await page.getByTestId("room-id").textContent()) ?? "";
  const roomId = roomText.replace("Room ID:", "").trim();
  expect(roomId.length).toBeGreaterThan(0);
  return roomId;
}

export async function joinOnlineRoom(page: Page, roomId: string, playerName: string) {
  await openOnlineLobby(page, playerName);
  await page.getByTestId("room-id-input").fill(roomId);
  await page.getByTestId("join-room-button").click();
  await expect(page.getByTestId("room-id")).toContainText(roomId);
}

export async function setupFourPlayerOnlineGame(browser: Browser): Promise<OnlineGameSetup> {
  const pages = await Promise.all(Array.from({ length: 4 }, () => browser.newPage()));
  const roomId = await createOnlineRoom(pages[0], "Player 1");

  for (let index = 1; index < pages.length; index += 1) {
    await joinOnlineRoom(pages[index], roomId, `Player ${index + 1}`);
    await pages[index].getByTestId("ready-button").click();
  }

  await expect(pages[0].getByTestId("start-game-button")).toBeEnabled();
  await pages[0].getByTestId("start-game-button").click();
  await Promise.all(pages.map((page) => expect(page.getByTestId("play-screen")).toBeVisible()));
  return { pages, roomId };
}

export async function getCardLabels(page: Page) {
  return page.getByTestId("hand-card").evaluateAll((cards) =>
    cards.map((card) => ({
      id: card.getAttribute("data-card-id") ?? "",
      label: card.getAttribute("data-card-label") ?? "",
    })),
  );
}

export async function getDrawnCardLabel(page: Page) {
  const drawn = page.getByTestId("drawn-card");
  await expect(drawn).toBeVisible();
  return (await drawn.getAttribute("data-card-label")) ?? "";
}
