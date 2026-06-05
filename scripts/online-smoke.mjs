import { io } from "socket.io-client";

const url = process.env.ONLINE_SERVER_URL ?? "http://localhost:3001";
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function connectClient(label) {
  const socket = io(url, { transports: ["websocket"], timeout: 2000 });
  const state = { label, room: null, playerId: null, view: null, rejected: [] };
  socket.on("playerView", (payload) => {
    state.room = payload.room;
    state.playerId = payload.playerId;
    state.view = payload.state;
  });
  socket.on("roomUpdated", (room) => {
    state.room = room;
  });
  socket.on("actionRejected", (payload) => {
    state.rejected.push(payload);
    if (payload.playerView?.state) state.view = payload.playerView.state;
  });
  socket.on("errorMessage", (message) => {
    throw new Error(`${label}: ${message}`);
  });
  return { socket, state };
}

function emitAck(socket, event, payload) {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

const clients = ["P1", "P2", "P3", "P4"].map(connectClient);
await Promise.all(clients.map(({ socket }) => new Promise((resolve) => socket.on("connect", resolve))));

const created = await emitAck(clients[0].socket, "createRoom", { playerName: "Player 1", maxPlayers: 4 });
if (!created.ok) throw new Error(created.error);

for (let index = 1; index < 4; index += 1) {
  const joined = await emitAck(clients[index].socket, "joinRoom", {
    roomId: created.roomId,
    playerName: `Player ${index + 1}`,
  });
  if (!joined.ok) throw new Error(joined.error);
  clients[index].socket.emit("ready", { ready: true });
}

await wait(300);
clients[0].socket.emit("startGame");
await wait(500);

const initialViews = clients.map((client) => client.state.view);
if (!initialViews.every(Boolean)) throw new Error("missing initial player views");
if (initialViews[0].deckRemaining !== 64) throw new Error(`expected deckRemaining 64, got ${initialViews[0].deckRemaining}`);
if (!initialViews.every((view) => view.deck.length === 0)) throw new Error("client received deck contents");
if (!initialViews[0].availableActions.includes("drawFromDeck")) throw new Error("host cannot draw");
if (initialViews.slice(1).some((view) => view.availableActions.includes("drawFromDeck"))) {
  throw new Error("non-current player can draw in view");
}
if (initialViews.some((view) => view.players.some((player) => String(player.name).includes("standard-CPU")))) {
  throw new Error("CPU label leaked into online player name");
}

clients[1].socket.emit("submitAction", {
  action: { type: "drawFromDeck" },
  stateVersion: initialViews[1].stateVersion,
});
await wait(200);
if (clients[1].state.rejected.at(-1)?.reason !== "not_your_turn") {
  throw new Error("non-current draw was not rejected as not_your_turn");
}

clients[0].socket.emit("submitAction", {
  action: { type: "drawFromDeck" },
  stateVersion: initialViews[0].stateVersion,
});
await wait(500);

const hostAfterDraw = clients[0].state.view;
const p2AfterDraw = clients[1].state.view;
if (hostAfterDraw.stateVersion !== 1) throw new Error(`draw did not increment version to 1: ${hostAfterDraw.stateVersion}`);
if (hostAfterDraw.phase !== "discard") throw new Error(`host phase after draw should be discard: ${hostAfterDraw.phase}`);
if (hostAfterDraw.players[0].hand.length !== 11) throw new Error("host hand did not grow to 11");
if (p2AfterDraw.players[0].hand.length !== 11) throw new Error("other views do not show host hand count 11");
if (p2AfterDraw.players[0].hand.some((card) => !card.id.startsWith("hidden-hand-"))) {
  throw new Error("other player received host hand card ids");
}

clients[1].socket.emit("submitAction", {
  action: { type: "drawFromDeck" },
  stateVersion: initialViews[1].stateVersion,
});
await wait(200);
if (clients[1].state.rejected.at(-1)?.reason !== "stale_state_version") {
  throw new Error("stale action was not rejected");
}

const discardCardId = hostAfterDraw.players[0].hand[0].id;
clients[0].socket.emit("submitAction", {
  action: { type: "discard", cardId: discardCardId },
  stateVersion: hostAfterDraw.stateVersion,
});
await wait(500);

const afterDiscardViews = clients.map((client) => client.state.view);
if (!afterDiscardViews.every((view) => view.stateVersion === 2)) throw new Error("discard did not broadcast version 2");
if (!afterDiscardViews.every((view) => view.currentPlayerIndex === 1 && view.phase === "draw")) {
  throw new Error("turn did not advance to player 2 draw");
}
if (!afterDiscardViews.every((view) => view.players[0].discardPile.length === 1)) {
  throw new Error("discard pile not public on all views");
}
if (!afterDiscardViews[1].availableActions.includes("drawFromDeck")) throw new Error("next player cannot draw");
if (afterDiscardViews[0].availableActions.includes("drawFromDeck")) throw new Error("previous player can still draw");

console.log(
  JSON.stringify({
    ok: true,
    roomId: created.roomId,
    deckRemainingStart: initialViews[0].deckRemaining,
    afterDrawVersion: hostAfterDraw.stateVersion,
    afterDiscardVersion: afterDiscardViews[0].stateVersion,
    currentPlayerIndex: afterDiscardViews[0].currentPlayerIndex,
  }),
);

clients.forEach(({ socket }) => socket.close());
