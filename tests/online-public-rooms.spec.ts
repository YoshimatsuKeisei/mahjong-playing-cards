import { expect, test } from "@playwright/test";
import { io, type Socket } from "socket.io-client";
import { createDefaultDaifugoOptions } from "../src/game/deck";
import type { CreateRoomPayload, OnlinePublicRoom } from "../src/online/types";

const url = "http://localhost:3001";

test("room select routes creation to settings and joining to public room list", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("home-menu-newGame").click();

  await page.getByTestId("local-create-room-choice").click();
  await expect(page.getByTestId("offline-start-button")).toBeVisible();

  await page.getByRole("button", { name: "キャンセル" }).click();
  await page.getByTestId("online-join-room-choice").click();
  await expect(page.getByRole("heading", { name: "募集中ルーム一覧" })).toBeVisible();
  await expect(page.getByTestId("room-id-input")).toHaveCount(0);
});

test("public room list filters, sorts, exposes only public metadata, and joins without room id input", async ({ page }) => {
  const host = await connectSocket();
  const lateHost = await connectSocket();
  const privateHost = await connectSocket();
  const cpuOnlyHost = await connectSocket();
  const earlyName = `Phase55 Early ${Date.now()}`;
  const lateName = `Phase55 Late ${Date.now()}`;
  const privateName = `Phase55 Private ${Date.now()}`;
  const cpuOnlyName = `Phase55 CPU Only ${Date.now()}`;

  try {
    const early = await emitAck(host, "createRoom", makeCreatePayload(earlyName, { humanPlayers: 3, cpuPlayers: 1, cpuModelIds: ["tactical"] }));
    expect(early.ok).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const late = await emitAck(lateHost, "createRoom", makeCreatePayload(lateName, { humanPlayers: 4, cpuPlayers: 0, cpuModelIds: [] }));
    expect(late.ok).toBe(true);
    const hiddenPrivate = await emitAck(privateHost, "createRoom", makeCreatePayload(privateName, { visibility: "private" }));
    expect(hiddenPrivate.ok).toBe(true);
    const hiddenCpuOnly = await emitAck(cpuOnlyHost, "createRoom", makeCreatePayload(cpuOnlyName, { humanPlayers: 1, cpuPlayers: 3, cpuModelIds: ["standard", "standard", "standard"] }));
    expect(hiddenCpuOnly.ok).toBe(true);

    const listed = await emitList(host);
    const createdNames = new Set([earlyName, lateName, privateName, cpuOnlyName]);
    const phaseRooms = listed.filter((room) => createdNames.has(room.roomName));
    expect(phaseRooms.map((room) => room.roomName)).toEqual([earlyName, lateName]);
    expect(JSON.stringify(phaseRooms)).not.toMatch(/hand|deck|jShield|state|FullGameState/i);

    const earlyRoom = phaseRooms[0];
    expect(earlyRoom.totalPlayers).toBe(4);
    expect(earlyRoom.humanPlayers).toBe(3);
    expect(earlyRoom.joinedHumanPlayers).toBe(1);
    expect(earlyRoom.cpuPlayers).toBe(1);
    expect(earlyRoom.cpuModelIds).toEqual(["tactical"]);
    expect(earlyRoom.roundCount).toBe(10);
    expect(earlyRoom.daifugoOptions.enabled).toBe(true);

    await page.goto("/");
    await page.getByTestId("home-menu-newGame").click();
    await page.getByTestId("online-join-room-choice").click();

    const cards = page.getByTestId("public-room-card").filter({ hasText: earlyName });
    await expect(cards).toHaveCount(1);
    await expect(cards.getByTestId("public-room-name")).toHaveText(earlyName);
    await expect(cards).toContainText("4人対戦");
    await expect(cards).toContainText("局数制 10局");
    await expect(cards).toContainText("大富豪あり（5, 7, 8, 9, 10, J, Q）");
    await expect(cards.getByTestId("public-room-recruitment")).toHaveText("募集人数 1/3人");
    await expect(cards.getByTestId("public-room-cpu")).toHaveText("CPU(Pro)1体");
    await expect(cards).not.toContainText(early.roomId);
    await expect(page.getByTestId("room-id-input")).toHaveCount(0);

    await cards.getByTestId("public-room-join-button").click();
    await expect(page.getByTestId("online-lobby-title")).toBeVisible();
    await expect(page.getByTestId("room-id")).toHaveCount(0);
    await expect(page.getByTestId("room-id-input")).toHaveCount(0);
  } finally {
    host.close();
    lateHost.close();
    privateHost.close();
    cpuOnlyHost.close();
  }
});

function connectSocket(): Promise<Socket> {
  const socket = io(url, { transports: ["websocket"], timeout: 2_000 });
  return withTimeout(new Promise((resolve) => socket.on("connect", () => resolve(socket))), "socket connect timed out");
}

function emitAck(socket: Socket, event: string, payload?: unknown): Promise<any> {
  return withTimeout(new Promise((resolve) => socket.emit(event, payload, resolve)), `${event} ack timed out`);
}

function emitList(socket: Socket): Promise<OnlinePublicRoom[]> {
  return withTimeout(new Promise((resolve) => socket.emit("listPublicRooms", resolve)), "listPublicRooms ack timed out");
}

function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(message)), 5_000);
    }),
  ]);
}

function makeCreatePayload(
  roomName: string,
  overrides: Partial<CreateRoomPayload["roomSettings"]> = {},
): CreateRoomPayload {
  const daifugoOptions = createDefaultDaifugoOptions();
  return {
    playerName: `${roomName} Host`,
    roomSettings: {
      roomName,
      totalPlayers: overrides.totalPlayers ?? 4,
      humanPlayers: overrides.humanPlayers ?? 3,
      cpuPlayers: overrides.cpuPlayers ?? 1,
      matchType: overrides.matchType ?? "rounds",
      visibility: overrides.visibility ?? "public",
      roundCount: overrides.roundCount ?? 10,
      targetScore: overrides.targetScore,
      initialPoints: overrides.initialPoints,
      turnDirection: overrides.turnDirection ?? "clockwise",
      cpuModelId: overrides.cpuModelId ?? "tactical",
      cpuModelIds: overrides.cpuModelIds ?? ["tactical"],
      showCpuActions: overrides.showCpuActions ?? true,
      daifugoOptions: {
        ...daifugoOptions,
        enabled: true,
        effects: {
          fiveSkip: true,
          sevenExchange: true,
          eightExtraTurn: true,
          nineReverse: true,
          tenSwapDraw: true,
          jackBack: true,
          queenNumberVanish: true,
        },
      },
    },
  };
}
