import { expect, test } from "@playwright/test";
import { closeSocketClients, setupSocketRoom, submitSocketAction, waitForSocket } from "./online-socket-helpers";

test("online next round keeps room seats and starts a fresh server state", async () => {
  const clients = await setupSocketRoom("online-tsumo-basic");
  const host = clients[0];
  const playerIds = clients.map((client) => client.state.view.players.map((player: any) => player.id).join("|"));

  submitSocketAction(host, { type: "drawFromDeck" });
  await waitForSocket(() => host.state.view.phase === "discard", "tsumo draw did not enter discard");
  const option = host.state.view.winningDiscardOptions[0];
  submitSocketAction(host, { type: "winWithDiscard", discardCardId: option.discardCard.id });
  await waitForSocket(() => host.state.view.phase === "result", "result did not appear before next round");

  host.socket.emit("nextRound");
  await waitForSocket(() => clients.every((client) => client.state.view.phase === "draw" && client.state.matchState.currentRound === 2), "next round did not start");

  expect(clients.map((client) => client.state.view.players.map((player: any) => player.id).join("|"))).toEqual(playerIds);
  expect(clients.every((client) => client.state.view.deckRemaining === 104)).toBe(true);
  expect(clients.every((client) => client.state.view.players.every((player: any) => player.discardPile.length === 0))).toBe(true);
  expect(clients.every((client) => client.state.view.pendingDaifugoEffect === null && client.state.view.drawnCard === null)).toBe(true);
  expect(clients.every((client) => client.state.matchState.history.length === 1)).toBe(true);

  closeSocketClients(clients);
});
