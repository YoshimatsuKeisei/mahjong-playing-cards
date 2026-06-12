import { expect, test } from "@playwright/test";
import { io, type Socket } from "socket.io-client";
import { createDefaultDaifugoOptions } from "../src/game/deck";
import type { CreateRoomPayload, OnlinePublicRoom } from "../src/online/types";

const url = "http://localhost:3001";

test("room select routes creation to settings and joining to public room list", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByTestId("home-menu-newGame").click();

  await page.getByTestId("local-create-room-choice").click();
  await expect(page.getByTestId("offline-start-button")).toBeVisible();

  await page.getByRole("button", { name: "キャンセル" }).click();
  await page.getByTestId("online-join-room-choice").click();
  await expect(
    page.getByRole("heading", { name: "募集中ルーム一覧" }),
  ).toBeVisible();
  await expect(page.getByTestId("room-id-input")).toHaveCount(0);
});

test("creating a room from the room creation screen opens the existing online lobby", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByTestId("home-menu-newGame").click();
  await page.getByTestId("local-create-room-choice").click();

  await page.getByTestId("offline-start-button").click();

  await expect(page.getByTestId("online-lobby-screen")).toBeVisible();
  await expect(page.getByTestId("online-lobby-title")).toBeVisible();
  await expect(page.getByTestId("start-game-button")).toBeVisible();
  await expect(page.getByTestId("room-id")).toHaveCount(0);
  await expect(page.getByTestId("room-id-input")).toHaveCount(0);

  await page.getByTestId("online-lobby-back-button").click();
  await expect(page.getByRole("heading", { name: "ルーム選択" })).toBeVisible();
});

test("waiting rooms are removed when the host leaves and updated when a guest leaves", async () => {
  const host = await connectSocket();
  const guest = await connectSocket();
  const roomName = `Phase55 Leave ${Date.now()}`;

  try {
    const created = await emitAck(
      host,
      "createRoom",
      makeCreatePayload(roomName, {
        humanPlayers: 3,
        cpuPlayers: 0,
        cpuModelIds: [],
      }),
    );
    expect(created.ok).toBe(true);
    const joined = await emitAck(guest, "joinRoom", {
      roomId: created.roomId,
      playerName: "Guest",
    });
    expect(joined.ok).toBe(true);

    await waitForPublicRoom(
      host,
      roomName,
      (room) => room.joinedHumanPlayers === 2,
    );
    guest.emit("leaveRoom");
    await waitForPublicRoom(
      host,
      roomName,
      (room) => room.joinedHumanPlayers === 1,
    );

    host.emit("leaveRoom");
    await waitForRoomMissing(guest, roomName);
  } finally {
    host.close();
    guest.close();
  }
});

test("waiting rooms do not become zombies when sockets disconnect", async () => {
  const host = await connectSocket();
  const guest = await connectSocket();
  const hostDisconnectName = `Phase55 Host Disconnect ${Date.now()}`;
  const guestDisconnectName = `Phase55 Guest Disconnect ${Date.now()}`;

  try {
    const hostDisconnectRoom = await emitAck(
      host,
      "createRoom",
      makeCreatePayload(hostDisconnectName, {
        humanPlayers: 3,
        cpuPlayers: 0,
        cpuModelIds: [],
      }),
    );
    expect(hostDisconnectRoom.ok).toBe(true);
    host.close();
    await waitForRoomMissing(guest, hostDisconnectName);

    const nextHost = await connectSocket();
    try {
      const guestDisconnectRoom = await emitAck(
        nextHost,
        "createRoom",
        makeCreatePayload(guestDisconnectName, {
          humanPlayers: 3,
          cpuPlayers: 0,
          cpuModelIds: [],
        }),
      );
      expect(guestDisconnectRoom.ok).toBe(true);
      const joined = await emitAck(guest, "joinRoom", {
        roomId: guestDisconnectRoom.roomId,
        playerName: "Guest",
      });
      expect(joined.ok).toBe(true);
      await waitForPublicRoom(
        nextHost,
        guestDisconnectName,
        (room) => room.joinedHumanPlayers === 2,
      );
      guest.close();
      await waitForPublicRoom(
        nextHost,
        guestDisconnectName,
        (room) => room.joinedHumanPlayers === 1,
      );
    } finally {
      nextHost.close();
    }
  } finally {
    host.close();
    guest.close();
  }
});

test("public room list filters, sorts, exposes only public metadata, and joins without room id input", async ({
  page,
}) => {
  const host = await connectSocket();
  const lateHost = await connectSocket();
  const privateHost = await connectSocket();
  const earlyName = `Phase55 Early ${Date.now()}`;
  const lateName = `Phase55 Late ${Date.now()}`;
  const privateName = `Phase55 Private ${Date.now()}`;

  try {
    const early = await emitAck(
      host,
      "createRoom",
      makeCreatePayload(earlyName, {
        humanPlayers: 4,
        cpuPlayers: 0,
        cpuModelIds: [],
      }),
    );
    expect(early.ok).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const late = await emitAck(
      lateHost,
      "createRoom",
      makeCreatePayload(lateName, {
        humanPlayers: 4,
        cpuPlayers: 0,
        cpuModelIds: [],
        daifugoOptions: { ...createDefaultDaifugoOptions(), enabled: false },
      }),
    );
    expect(late.ok).toBe(true);
    const hiddenPrivate = await emitAck(
      privateHost,
      "createRoom",
      makeCreatePayload(privateName, { visibility: "private" }),
    );
    expect(hiddenPrivate.ok).toBe(true);

    const listed = await emitList(host);
    const createdNames = new Set([earlyName, lateName, privateName]);
    const phaseRooms = listed.filter((room) => createdNames.has(room.roomName));
    expect(phaseRooms.map((room) => room.roomName)).toEqual([
      earlyName,
      lateName,
    ]);
    expect(JSON.stringify(phaseRooms)).not.toMatch(
      /hand|deck|jShield|state|FullGameState/i,
    );

    const earlyRoom = phaseRooms[0];
    expect(earlyRoom.totalPlayers).toBe(4);
    expect(earlyRoom.humanPlayers).toBe(4);
    expect(earlyRoom.joinedHumanPlayers).toBe(1);
    expect(earlyRoom.cpuPlayers).toBe(0);
    expect(earlyRoom.cpuModelIds).toEqual([]);
    expect(earlyRoom.roundCount).toBe(10);
    expect(earlyRoom.daifugoOptions.enabled).toBe(true);

    await page.goto("/");
    await page.getByTestId("home-menu-newGame").click();
    await page.getByTestId("online-join-room-choice").click();

    const cards = page
      .getByTestId("public-room-card")
      .filter({ hasText: earlyName });
    await expect(cards).toHaveCount(1);
    const cardBackground = await cards.evaluate(
      (card) => getComputedStyle(card).backgroundImage,
    );
    expect(cardBackground).toContain("rgb");
    await expect(cards.getByText("ルーム名", { exact: true })).toBeVisible();
    await expect(cards.getByText("人数", { exact: true })).toBeVisible();
    await expect(cards.getByText("試合形式", { exact: true })).toBeVisible();
    await expect(cards.getByText("詳細", { exact: true })).toBeVisible();
    await expect(cards.getByText("追加ルール", { exact: true })).toBeVisible();
    await expect(cards.getByText("募集人数", { exact: true })).toBeVisible();
    await expect(cards.getByTestId("public-room-name")).toHaveText(earlyName);
    await expect(cards).toContainText("4人プレイ");
    await expect(cards).toContainText("局数制");
    await expect(cards).toContainText("10局");
    const extraRules = cards.getByTestId("public-room-extra-rules");
    await expect(extraRules).toContainText("大富豪あり");
    for (const label of ["5", "7", "8", "9", "10", "J", "Q"]) {
      await expect(extraRules).toContainText(label);
    }
    await expect(cards.getByTestId("public-room-recruitment")).toHaveText(
      "募集人数 1/4人",
    );
    await expect(cards.getByTestId("public-room-cpu")).toHaveText("CPUなし");
    await expect(cards).not.toContainText(early.roomId);
    await expect(page.getByTestId("room-id-input")).toHaveCount(0);

    const noRuleCard = page
      .getByTestId("public-room-card")
      .filter({ hasText: lateName });
    await expect(noRuleCard.getByTestId("public-room-extra-rules")).toHaveText(
      "なし",
    );
    await expect(noRuleCard.getByTestId("public-room-cpu")).toHaveText(
      "CPUなし",
    );

    await cards.getByTestId("public-room-join-button").click();
    await expect(page.getByTestId("online-lobby-screen")).toBeVisible();
    await expect(page.getByTestId("online-lobby-title")).toBeVisible();
    await expect(page.getByTestId("ready-button")).toBeVisible();
    await expect(page.getByTestId("start-game-button")).toHaveCount(0);
    await expect(page.getByTestId("room-id")).toHaveCount(0);
    await expect(page.getByTestId("room-id-input")).toHaveCount(0);
  } finally {
    host.close();
    lateHost.close();
    privateHost.close();
  }
});

test("online rooms reject CPU settings while CPU support is paused", async () => {
  const host = await connectSocket();
  try {
    const rejected = await emitAck(
      host,
      "createRoom",
      makeCreatePayload(`Paused CPU ${Date.now()}`, {
        humanPlayers: 3,
        cpuPlayers: 1,
        cpuModelIds: ["tactical"],
      }),
    );
    expect(rejected.ok).toBe(false);
  } finally {
    host.close();
  }
});

function connectSocket(): Promise<Socket> {
  const socket = io(url, { transports: ["websocket"], timeout: 2_000 });
  return withTimeout(
    new Promise((resolve) => socket.on("connect", () => resolve(socket))),
    "socket connect timed out",
  );
}

function emitAck(
  socket: Socket,
  event: string,
  payload?: unknown,
): Promise<any> {
  return withTimeout(
    new Promise((resolve) => socket.emit(event, payload, resolve)),
    `${event} ack timed out`,
  );
}

function emitList(socket: Socket): Promise<OnlinePublicRoom[]> {
  return withTimeout(
    new Promise((resolve) => socket.emit("listPublicRooms", resolve)),
    "listPublicRooms ack timed out",
  );
}

async function waitForPublicRoom(
  socket: Socket,
  roomName: string,
  predicate: (room: OnlinePublicRoom) => boolean,
) {
  await waitForCondition(async () => {
    const room = (await emitList(socket)).find(
      (candidate) => candidate.roomName === roomName,
    );
    return Boolean(room && predicate(room));
  }, `public room ${roomName} did not reach expected state`);
}

async function waitForRoomMissing(socket: Socket, roomName: string) {
  await waitForCondition(async () => {
    const room = (await emitList(socket)).find(
      (candidate) => candidate.roomName === roomName,
    );
    return !room;
  }, `public room ${roomName} was not removed`);
}

async function waitForCondition(
  predicate: () => Promise<boolean>,
  message: string,
) {
  const started = Date.now();
  while (Date.now() - started < 5_000) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(message);
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
      totalPlayers: overrides.totalPlayers ?? overrides.humanPlayers ?? 4,
      humanPlayers: overrides.humanPlayers ?? 4,
      cpuPlayers: overrides.cpuPlayers ?? 0,
      matchType: overrides.matchType ?? "rounds",
      visibility: overrides.visibility ?? "public",
      roundCount: overrides.roundCount ?? 10,
      targetScore: overrides.targetScore,
      initialPoints: overrides.initialPoints,
      turnDirection: overrides.turnDirection ?? "clockwise",
      cpuModelId: overrides.cpuModelId ?? "tactical",
      cpuModelIds: overrides.cpuModelIds ?? [],
      showCpuActions: overrides.showCpuActions ?? true,
      daifugoOptions: overrides.daifugoOptions ?? {
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
