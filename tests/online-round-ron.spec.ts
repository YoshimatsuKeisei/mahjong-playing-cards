import { expect, test } from "@playwright/test";
import { closeSocketClients, setupSocketRoom, submitSocketAction, waitForSocket } from "./online-socket-helpers";

test("online ron round end is broadcast with one winner and scores", async () => {
  const clients = await setupSocketRoom("online-ron-basic");
  const host = clients[0];
  const ronPlayer = clients[1];
  const discard = host.state.view.players[0].hand.find((card: any) => card.rank === 13);

  submitSocketAction(host, { type: "discard", cardId: discard.id });
  await waitForSocket(() => ronPlayer.state.view.phase === "ronCheck", "ron check did not start");
  submitSocketAction(ronPlayer, { type: "answerRon", takeRon: true });
  await waitForSocket(() => clients.every((client) => client.state.view.phase === "result"), "ron result was not broadcast");

  expect(host.state.view.result.winType).toBe("ron");
  expect(host.state.view.result.ronResults).toHaveLength(1);
  expect(clients.every((client) => client.state.matchState.history.length === 1)).toBe(true);
  expect(clients.every((client) => client.state.matchState.cumulativeScores[1] > 0)).toBe(true);

  closeSocketClients(clients);
});
