import { expect, test } from "@playwright/test";
import { closeSocketClients, setupSocketRoom, submitSocketAction, waitForSocket } from "./online-socket-helpers";

test("online tsumo round end is broadcast with scores and masked hidden state", async () => {
  const clients = await setupSocketRoom("online-tsumo-basic");
  const host = clients[0];

  submitSocketAction(host, { type: "drawFromDeck" });
  await waitForSocket(() => host.state.view.phase === "discard", "tsumo draw did not enter discard");
  const option = host.state.view.winningDiscardOptions[0];
  submitSocketAction(host, { type: "winWithDiscard", discardCardId: option.discardCard.id });
  await waitForSocket(() => clients.every((client) => client.state.view.phase === "result"), "tsumo result was not broadcast");

  expect(host.state.view.result.winType).toBe("tsumo");
  expect(clients.every((client) => client.state.matchState.history.length === 1)).toBe(true);
  expect(clients.every((client) => client.state.matchState.cumulativeScores[0] > 0)).toBe(true);
  expect(clients[1].state.view.players[0].hand.every((card: any) => String(card.id).startsWith("hidden-hand-"))).toBe(true);
  expect(clients.every((client) => client.state.view.deck.length === 0)).toBe(true);

  closeSocketClients(clients);
});
