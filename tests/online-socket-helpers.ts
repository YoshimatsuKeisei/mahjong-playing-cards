import { expect } from "@playwright/test";
import { io, type Socket } from "socket.io-client";

const url = "http://localhost:3001";

export interface SocketClientState {
  view: any;
  matchState: any;
  rejected: any[];
}

export interface SocketClient {
  socket: Socket;
  state: SocketClientState;
}

export function connectSocketClient(): Promise<SocketClient> {
  const socket = io(url, { transports: ["websocket"], timeout: 2_000 });
  const state: SocketClientState = { view: null, matchState: null, rejected: [] };
  socket.on("playerView", (payload) => {
    state.view = payload.state;
    state.matchState = payload.matchState;
  });
  socket.on("actionRejected", (payload) => {
    state.rejected.push(payload);
    if (payload.playerView?.state) {
      state.view = payload.playerView.state;
      state.matchState = payload.playerView.matchState;
    }
  });
  return new Promise((resolve) => socket.on("connect", () => resolve({ socket, state })));
}

export function emitAck(socket: Socket, event: string, payload?: unknown): Promise<any> {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

export async function waitForSocket(predicate: () => boolean, message: string) {
  const started = Date.now();
  while (Date.now() - started < 3_000) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(message);
}

export async function setupSocketRoom(scenario: string) {
  const clients = await Promise.all(Array.from({ length: 4 }, () => connectSocketClient()));
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
  await waitForSocket(() => clients.every((client) => client.state.view), "missing started player views");
  return clients;
}

export function submitSocketAction(client: SocketClient, action: any, stateVersion = client.state.view.stateVersion) {
  client.socket.emit("submitAction", {
    action,
    stateVersion,
  });
}

export function closeSocketClients(clients: SocketClient[]) {
  clients.forEach((client) => client.socket.close());
}
