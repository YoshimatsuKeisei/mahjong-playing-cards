import { expect, test } from "@playwright/test";
import { closeSocketClients, setupSocketRoom, submitSocketAction, waitForSocket } from "./online-socket-helpers";

test("online 10 effect accepts extra discard and effect draw without leaking the deck", async () => {
  const clients = await setupSocketRoom("online-effect-10");
  const host = clients[0];
  const ten = host.state.view.players[0].hand.find((card: any) => card.rank === 10);

  submitSocketAction(host, { type: "discard", cardId: ten.id });
  await waitForSocket(() => host.state.view.pendingDaifugoEffect?.kind === "confirm", "10 did not enter effect confirm");
  submitSocketAction(host, { type: "answerDaifugoEffect", activate: true });
  await waitForSocket(() => host.state.view.pendingDaifugoEffect?.kind === "extraDiscard", "10 did not enter extra discard");

  const extra = host.state.view.players[0].hand[0];
  submitSocketAction(host, { type: "discardForDaifugoEffect", cardId: extra.id });
  await waitForSocket(() => host.state.view.pendingDaifugoEffect?.kind === "effectDraw", "10 did not enter effect draw");
  submitSocketAction(host, { type: "drawForDaifugoEffect" });
  await waitForSocket(() => host.state.view.pendingDaifugoEffect === null, "10 effect draw did not resolve");

  expect(clients.every((client) => client.state.view.deck.length === 0)).toBe(true);
  expect(clients.every((client) => client.state.view.players[0].discardPile.some((card: any) => card.id === extra.id))).toBe(true);

  closeSocketClients(clients);
});
