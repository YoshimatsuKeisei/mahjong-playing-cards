import { expect, type Browser, type Page } from "@playwright/test";

export interface OnlineGameSetup {
  pages: Page[];
  roomId: string;
}

export async function openOnlineLobby(page: Page, playerName: string, scenario?: string) {
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") {
      console.log(`[${playerName}] ${message.type()}: ${message.text()}`);
    }
  });
  await page.goto(scenario ? `/?scenario=${encodeURIComponent(scenario)}` : "/");
  await page.getByTestId("home-menu-newGame").click();
}

export async function createOnlineRoom(page: Page, playerName = "Player 1", scenario?: string) {
  await openOnlineLobby(page, playerName, scenario);
  const roomName = `Online ${Date.now()}`;
  await page.getByTestId("local-create-room-choice").click();
  await page.getByTestId("room-name-input").fill(roomName);
  await page.getByRole("switch").first().click();
  await page.getByTestId("offline-start-button").click();
  await expect(page.getByTestId("online-lobby-screen")).toBeVisible();
  return roomName;
}

export async function joinOnlineRoom(page: Page, roomName: string, playerName: string) {
  await openOnlineLobby(page, playerName);
  await page.getByTestId("online-join-room-choice").click();
  const card = page.getByTestId("public-room-card").filter({ hasText: roomName });
  await card.getByTestId("public-room-join-button").click();
  await expect(page.getByTestId("online-lobby-screen")).toBeVisible();
}

export async function setupFourPlayerOnlineGame(browser: Browser, scenario?: string): Promise<OnlineGameSetup> {
  const pages = await Promise.all(Array.from({ length: 4 }, () => browser.newPage()));
  const roomId = await createOnlineRoom(pages[0], "Player 1", scenario);

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
