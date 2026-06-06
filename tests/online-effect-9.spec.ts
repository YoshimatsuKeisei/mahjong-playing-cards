import { expect, test } from "@playwright/test";
import { closeSocketClients, setupSocketRoom, submitSocketAction, waitForSocket } from "./online-socket-helpers";

test("online 9 effect reverses direction and advances to the correct player", async () => {
  const clients = await setupSocketRoom("online-effect-9");
  const host = clients[0];
  const nine = host.state.view.players[0].hand.find((card: any) => card.rank === 9);

  submitSocketAction(host, { type: "discard", cardId: nine.id });
  await waitForSocket(() => host.state.view.pendingDaifugoEffect?.kind === "confirm", "9 did not enter effect confirm");
  submitSocketAction(host, { type: "answerDaifugoEffect", activate: true });
  await waitForSocket(() => host.state.view.phase === "draw" && host.state.view.direction === "counterclockwise", "9 reverse did not resolve");

  expect(host.state.view.currentPlayerIndex).toBe(3);
  expect(clients.every((client) => client.state.view.direction === "counterclockwise")).toBe(true);

  closeSocketClients(clients);
});
