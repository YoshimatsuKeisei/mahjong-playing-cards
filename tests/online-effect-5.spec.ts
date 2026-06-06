import { expect, test } from "@playwright/test";
import { closeSocketClients, setupSocketRoom, submitSocketAction, waitForSocket } from "./online-socket-helpers";

test("online 5 effect skips the next player server-side", async () => {
  const clients = await setupSocketRoom("online-effect-5");
  const host = clients[0];
  const five = host.state.view.players[0].hand.find((card: any) => card.rank === 5);

  submitSocketAction(host, { type: "discard", cardId: five.id });
  await waitForSocket(() => host.state.view.pendingDaifugoEffect?.kind === "confirm", "5 did not enter effect confirm");
  await expect(host.state.view.pendingDaifugoEffect.effect).toBe("fiveSkip");
  expect(clients[1].state.view.pendingDaifugoEffect).toBeNull();

  submitSocketAction(host, { type: "answerDaifugoEffect", activate: true });
  await waitForSocket(() => host.state.view.phase === "draw" && host.state.view.currentPlayerIndex === 2, "5 skip did not advance to player 3 draw");
  expect(clients.every((client) => client.state.view.currentPlayerIndex === 2)).toBe(true);
  expect(host.state.view.stateVersion).toBe(2);

  closeSocketClients(clients);
});
