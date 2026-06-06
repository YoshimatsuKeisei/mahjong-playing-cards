import { expect, test } from "@playwright/test";
import { closeSocketClients, setupSocketRoom, submitSocketAction, waitForSocket } from "./online-socket-helpers";

test("online deckout ends the round with zero scores and no deck leak", async () => {
  const clients = await setupSocketRoom("online-round-deckout");
  const host = clients[0];

  expect(host.state.view.deckRemaining).toBe(0);
  submitSocketAction(host, { type: "drawFromDeck" });
  await waitForSocket(() => clients.every((client) => client.state.view.phase === "result"), "deckout result was not broadcast");

  expect(host.state.view.result.winType).toBe("deckout");
  expect(host.state.view.result.winnerIndex).toBe(-1);
  expect(clients.every((client) => client.state.matchState.history.length === 1)).toBe(true);
  expect(clients.every((client) => client.state.matchState.cumulativeScores.every((score: number) => score === 0))).toBe(true);
  expect(clients.every((client) => client.state.view.deck.length === 0)).toBe(true);

  closeSocketClients(clients);
});
