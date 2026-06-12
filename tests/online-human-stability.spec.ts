import { expect, test } from "@playwright/test";
import { createDefaultDaifugoOptions } from "../src/game/deck";
import type { CreateRoomPayload, OnlineRoomCreateSettings } from "../src/online/types";
import { closeSocketClients, connectSocketClient, emitAck, submitSocketAction, waitForSocket, type SocketClient } from "./online-socket-helpers";

test.describe("human-only online stability", () => {
  for (const playerCount of [3, 4, 5] as const) {
    test(`${playerCount}-player online room starts with human seats only`, async () => {
      const clients = await setupHumanOnlyRoom(playerCount);
      try {
        const hostView = clients[0].state.view;
        expect(hostView.players).toHaveLength(playerCount);
        expect(hostView.players.every((player: any) => player.isCpu === false && player.type === "human")).toBe(true);
        expect(hostView.players.map((player: any) => player.id).sort()).toEqual(
          Array.from({ length: playerCount }, (_, index) => `player-${index + 1}`).sort(),
        );
        expect(hostView.currentPlayerIndex).toBeGreaterThanOrEqual(0);
        expect(hostView.currentPlayerIndex).toBeLessThan(playerCount);
        expect(hostView.deck).toHaveLength(0);
        expect(hostView.players[1].hand.every((card: any) => String(card.id).startsWith("hidden-hand-1-"))).toBe(true);
      } finally {
        closeSocketClients(clients);
      }
    });
  }

  for (const matchType of ["rounds", "targetScore", "startingPoints"] as const) {
    test(`human-only ${matchType} records all human players in result and history`, async () => {
      const clients = await setupHumanOnlyRoom(4, {
        matchType,
        roundCount: matchType === "rounds" ? 2 : undefined,
        targetScore: matchType === "targetScore" ? 50 : undefined,
        initialPoints: matchType === "startingPoints" ? 1000 : undefined,
      }, "online-round-deckout");
      try {
        const hostView = clients[0].state.view;
        const currentPlayerId = hostView.players[hostView.currentPlayerIndex].id;
        const host = clients.find((client) => client.playerId === currentPlayerId) ?? clients[0];
        submitSocketAction(host, { type: "drawFromDeck" });
        await waitForSocket(() => host.state.view?.phase === "result", `${matchType} did not reach result`);

        expect(host.state.view.players).toHaveLength(4);
        expect(host.state.view.players.every((player: any) => !player.isCpu)).toBe(true);
        expect(host.state.view.result.score.playerLosses).toHaveLength(4);
        expect(host.state.matchState.playerCount).toBe(4);
        expect(host.state.matchState.humanPlayerCount).toBe(4);
        expect(host.state.matchState.history[0].playerLosses).toHaveLength(4);
        expect(host.state.matchState.history[0].roundScores).toHaveLength(4);
        expect(host.state.matchState.history[0].pointDeductions).toHaveLength(4);
      } finally {
        closeSocketClients(clients);
      }
    });
  }
});

async function setupHumanOnlyRoom(
  playerCount: 3 | 4 | 5,
  settings: Partial<OnlineRoomCreateSettings> = {},
  scenario?: CreateRoomPayload["scenario"],
): Promise<SocketClient[]> {
  const clients = await Promise.all(Array.from({ length: playerCount }, () => connectSocketClient()));
  const created = await emitAck(clients[0].socket, "createRoom", makeHumanOnlyPayload(playerCount, settings, scenario));
  expect(created.ok).toBe(true);
  clients[0].playerId = created.playerId;
  for (let index = 1; index < clients.length; index += 1) {
    const joined = await emitAck(clients[index].socket, "joinRoom", {
      roomId: created.roomId,
      playerName: `Player ${index + 1}`,
    });
    expect(joined.ok).toBe(true);
    clients[index].playerId = joined.playerId;
    clients[index].socket.emit("ready", { ready: true });
  }
  clients[0].socket.emit("startGame");
  await waitForSocket(() => clients.every((client) => client.state.view?.players?.length === playerCount), "missing human-only started views");
  return clients;
}

function makeHumanOnlyPayload(
  playerCount: 3 | 4 | 5,
  overrides: Partial<OnlineRoomCreateSettings> = {},
  scenario?: CreateRoomPayload["scenario"],
): CreateRoomPayload {
  return {
    playerName: "Player 1",
    scenario,
    roomSettings: {
      roomName: `Human Stable ${playerCount} ${Date.now()}`,
      totalPlayers: playerCount,
      humanPlayers: playerCount,
      cpuPlayers: 0,
      matchType: overrides.matchType ?? "rounds",
      visibility: overrides.visibility ?? "private",
      roundCount: overrides.roundCount ?? 3,
      targetScore: overrides.targetScore,
      initialPoints: overrides.initialPoints,
      turnDirection: overrides.turnDirection ?? "clockwise",
      cpuModelId: "standard",
      cpuModelIds: [],
      showCpuActions: false,
      daifugoOptions: overrides.daifugoOptions ?? createDefaultDaifugoOptions(),
    },
  };
}
