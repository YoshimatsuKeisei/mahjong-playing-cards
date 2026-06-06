import { expect, test } from "@playwright/test";
import { io, type Socket } from "socket.io-client";

const url = "http://localhost:3001";

interface ClientState {
  playerId: string | null;
  view: any;
  rejected: any[];
}

function connectClient(): Promise<{ socket: Socket; state: ClientState }> {
  const socket = io(url, { transports: ["websocket"], timeout: 2_000 });
  const state: ClientState = { playerId: null, view: null, rejected: [] };
  socket.on("playerView", (payload) => {
    state.playerId = payload.playerId;
    state.view = payload.state;
  });
  socket.on("actionRejected", (payload) => {
    state.rejected.push(payload);
    if (payload.playerView?.state) state.view = payload.playerView.state;
  });
  return new Promise((resolve) => socket.on("connect", () => resolve({ socket, state })));
}

function emitAck(socket: Socket, event: string, payload?: unknown): Promise<any> {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

async function waitFor(predicate: () => boolean, message: string) {
  const started = Date.now();
  while (Date.now() - started < 3_000) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(message);
}

async function setupSocketRoom(scenario: string) {
  const clients = await Promise.all(Array.from({ length: 4 }, () => connectClient()));
  const created = await emitAck(clients[0].socket, "createRoom", { playerName: "Player 1", maxPlayers: 4, scenario });
  expect(created.ok).toBe(true);
  for (let index = 1; index < clients.length; index += 1) {
    const joined = await emitAck(clients[index].socket, "joinRoom", {
      roomId: created.roomId,
      playerName: `Player ${index + 1}`,
    });
    expect(joined.ok).toBe(true);
    clients[index].socket.emit("ready", { ready: true });
  }
  clients[0].socket.emit("startGame");
  await waitFor(() => clients.every((client) => client.state.view), "missing started player views");
  return clients;
}

test("online server rejects invalid reaction actions and does not leak hidden state", async () => {
  const callClients = await setupSocketRoom("online-call-basic");
  const callerView = callClients[1].state.view;
  const callCandidate = callerView.reaction.callCandidates[0];
  callClients[2].socket.emit("submitAction", {
    action: { type: "takeDiscard", ownerIndex: callCandidate.ownerIndex, meld: callCandidate.meld },
    stateVersion: callClients[2].state.view.stateVersion,
  });
  await waitFor(() => callClients[2].state.rejected.length > 0, "non-caller takeDiscard was not rejected");
  expect(callClients[2].state.rejected.at(-1).reason).toBe("not_your_turn");

  const ronClients = await setupSocketRoom("online-ron-basic");
  const discardCardId = ronClients[0].state.view.players[0].hand.find((card: any) => card.rank === 13).id;
  ronClients[0].socket.emit("submitAction", {
    action: { type: "discard", cardId: discardCardId },
    stateVersion: ronClients[0].state.view.stateVersion,
  });
  await waitFor(() => ronClients[1].state.view.pendingRonResult, "ron candidate did not appear");
  ronClients[2].socket.emit("submitAction", {
    action: { type: "answerRon", takeRon: true },
    stateVersion: ronClients[2].state.view.stateVersion,
  });
  await waitFor(() => ronClients[2].state.rejected.length > 0, "invalid ron was not rejected");
  expect(ronClients[2].state.rejected.at(-1).reason).toBe("not_your_reaction");

  ronClients[1].socket.emit("submitAction", {
    action: { type: "answerRon", takeRon: true },
    stateVersion: ronClients[1].state.view.stateVersion - 1,
  });
  await waitFor(() => ronClients[1].state.rejected.some((item) => item.reason === "stale_state_version"), "stale reaction was not rejected");

  const outsiderView = ronClients[2].state.view;
  expect(outsiderView.deck).toEqual([]);
  expect(outsiderView.players[1].hand.every((card: any) => String(card.id).startsWith("hidden-hand-"))).toBe(true);
  expect(outsiderView.pendingRonResult).toBeNull();

  [...callClients, ...ronClients].forEach((client) => client.socket.close());
});
