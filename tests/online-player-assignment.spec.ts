import { expect, test } from "@playwright/test";
import { closeSocketClients, connectSocketClient, emitAck, waitForSocket } from "./online-socket-helpers";

test("startGame assigns random Player numbers and preserves participant names", async () => {
  const clients = await Promise.all(Array.from({ length: 4 }, () => connectSocketClient()));
  const names = ["kouta", "sora", "mei", ""];

  try {
    const created = await emitAck(clients[0].socket, "createRoom", { playerName: names[0], maxPlayers: 4 });
    expect(created.ok).toBe(true);

    for (let index = 1; index < clients.length; index += 1) {
      const joined = await emitAck(clients[index].socket, "joinRoom", {
        roomId: created.roomId,
        playerName: names[index],
      });
      expect(joined.ok).toBe(true);
      clients[index].socket.emit("ready", { ready: true });
    }

    clients[0].socket.emit("startGame");
    await waitForSocket(() => clients.every((client) => client.state.view), "missing started player views");

    for (const client of clients) {
      const playerNames = client.state.view.players.map((player: { name: string }) => player.name);
      const assignedNumbers = playerNames
        .map((name: string) => name.match(/^Player(\d+):/)?.[1] ?? "")
        .filter(Boolean)
        .sort();

      expect(assignedNumbers).toEqual(["1", "2", "3", "4"]);
      expect(playerNames.some((name: string) => name.endsWith(":kouta"))).toBe(true);
      expect(playerNames.some((name: string) => name.endsWith(":sora"))).toBe(true);
      expect(playerNames.some((name: string) => name.endsWith(":mei"))).toBe(true);
      expect(playerNames.some((name: string) => name.endsWith(":Guest Player"))).toBe(true);
      expect(playerNames.every((name: string) => /^Player[1-4]:.+/.test(name))).toBe(true);
    }
  } finally {
    closeSocketClients(clients);
  }
});
