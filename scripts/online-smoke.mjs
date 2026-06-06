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
if (initialViews[0].deckRemaining !== 104) throw new Error(`expected deckRemaining 104, got ${initialViews[0].deckRemaining}`);
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
if (hostAfterDraw.deckRemaining !== 103) throw new Error(`expected deckRemaining 103 after host draw, got ${hostAfterDraw.deckRemaining}`);
if (hostAfterDraw.phase !== "discard") throw new Error(`host phase after draw should be discard: ${hostAfterDraw.phase}`);
if (hostAfterDraw.players[0].hand.length !== 11) throw new Error("host hand did not grow to 11");
if (!hostAfterDraw.drawnCard || !hostAfterDraw.players[0].hand.some((card) => card.id === hostAfterDraw.drawnCard.id)) {
  throw new Error("host drawnCard does not match a card in host hand");
}
if (hostAfterDraw.drawnCard.id === "online-hidden-draw") throw new Error("host received placeholder drawn card");
if (p2AfterDraw.players[0].hand.length !== 11) throw new Error("other views do not show host hand count 11");
if (p2AfterDraw.players[0].hand.some((card) => !card.id.startsWith("hidden-hand-"))) {
  throw new Error("other player received host hand card ids");
}
if (p2AfterDraw.drawnCard) throw new Error("other player can see host drawn card");

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

clients[1].socket.emit("submitAction", {
  action: { type: "drawFromDeck" },
  stateVersion: afterDiscardViews[1].stateVersion,
});
await wait(500);
const p2SecondDrawView = clients[1].state.view;
if (p2SecondDrawView.deckRemaining !== 102) {
  throw new Error(`expected deckRemaining 102 after second player draw, got ${p2SecondDrawView.deckRemaining}`);
}

function isRun(cards) {
  if (cards.length !== 3) return false;
  if (!cards.every((card) => card.suit === cards[0].suit)) return false;
  const ranks = cards.map((card) => card.rank).sort((a, b) => a - b);
  return ranks[0] + 1 === ranks[1] && ranks[1] + 1 === ranks[2];
}

function isTriple(cards) {
  return cards.length === 3 && cards.every((card) => card.rank === cards[0].rank);
}

function findCallMeldOptions(hand, discard) {
  const options = [];
  for (let i = 0; i < hand.length - 1; i += 1) {
    for (let j = i + 1; j < hand.length; j += 1) {
      const meld = [hand[i], hand[j], discard];
      if (isRun(meld) || isTriple(meld)) options.push(meld);
    }
  }
  return options;
}

async function findAndTakeDiscard() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const actorIndex = clients[0].state.view.currentPlayerIndex;
    const actorView = clients[actorIndex].state.view;
    if (actorView.phase === "draw") {
      clients[actorIndex].socket.emit("submitAction", {
        action: { type: "drawFromDeck" },
        stateVersion: actorView.stateVersion,
      });
      await wait(250);
    }

    const discardActorIndex = clients[0].state.view.currentPlayerIndex;
    const discardActorView = clients[discardActorIndex].state.view;
    const nextPlayerIndex = (discardActorIndex + 1) % clients.length;
    const nextHand = clients[nextPlayerIndex].state.view.players[nextPlayerIndex].hand;
    const discardCandidates = discardActorView.players[discardActorIndex].hand;
    const selectedDiscard =
      discardCandidates.find((candidate) => findCallMeldOptions(nextHand, candidate).length > 0) ?? discardCandidates[0];
    clients[discardActorIndex].socket.emit("submitAction", {
      action: { type: "discard", cardId: selectedDiscard.id },
      stateVersion: discardActorView.stateVersion,
    });
    await wait(350);

    const afterDiscard = clients[nextPlayerIndex].state.view;
    const discard = afterDiscard.players[discardActorIndex].discardPile.at(-1);
    const meld = discard ? findCallMeldOptions(afterDiscard.players[nextPlayerIndex].hand, discard)[0] : null;
    if (!meld) continue;

    clients[nextPlayerIndex].socket.emit("submitAction", {
      action: { type: "takeDiscard", ownerIndex: discardActorIndex, meld },
      stateVersion: afterDiscard.stateVersion,
    });
    await wait(500);
    const afterCallViews = clients.map((client) => client.state.view);
    if (!afterCallViews.every((view) => view.players[nextPlayerIndex].openMelds.length > 0)) {
      continue;
    }
    return {
      callerIndex: nextPlayerIndex,
      stateVersion: afterCallViews[0].stateVersion,
    };
  }
  throw new Error("could not find a legal takeDiscard smoke scenario");
}

const callResult = await findAndTakeDiscard();

console.log(
  JSON.stringify({
    ok: true,
    roomId: created.roomId,
    deckRemainingStart: initialViews[0].deckRemaining,
    afterDrawVersion: hostAfterDraw.stateVersion,
    afterDiscardVersion: afterDiscardViews[0].stateVersion,
    afterSecondDrawDeckRemaining: p2SecondDrawView.deckRemaining,
    takeDiscardVersion: callResult.stateVersion,
    takeDiscardCallerIndex: callResult.callerIndex,
  }),
);

clients.forEach(({ socket }) => socket.close());
