import { expect, test } from "@playwright/test";
import { closeSocketClients, setupSocketRoom, submitSocketAction, waitForSocket } from "./online-socket-helpers";

test("online double ron round end preserves both winners and cumulative scores", async () => {
  const clients = await setupSocketRoom("online-double-ron");
  const host = clients[0];
  const ronPlayer = clients[1];
  const discard = host.state.view.players[0].hand.find((card: any) => card.rank === 13);

  submitSocketAction(host, { type: "discard", cardId: discard.id });
  await waitForSocket(() => ronPlayer.state.view.phase === "ronCheck", "double ron check did not start");
  submitSocketAction(ronPlayer, { type: "answerRon", takeRon: true });
  await waitForSocket(() => clients.every((client) => client.state.view.phase === "result"), "double ron result was not broadcast");

  expect(host.state.view.result.winType).toBe("ron");
  expect(host.state.view.result.ronResults).toHaveLength(2);
  expect(host.state.matchState.history[0].result.ronResults).toHaveLength(2);
  expect(host.state.matchState.cumulativeScores[1]).toBeGreaterThan(0);
  expect(host.state.matchState.cumulativeScores[2]).toBeGreaterThan(0);

  closeSocketClients(clients);
});
