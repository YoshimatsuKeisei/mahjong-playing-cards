import { expect, test } from "@playwright/test";
import { closeSocketClients, setupSocketRoom, submitSocketAction, waitForSocket } from "./online-socket-helpers";

test("online 8 effect draws actor-only card and accepts extra discard", async () => {
  const clients = await setupSocketRoom("online-effect-8");
  const host = clients[0];
  const eight = host.state.view.players[0].hand.find((card: any) => card.rank === 8);

  submitSocketAction(host, { type: "discard", cardId: eight.id });
  await waitForSocket(() => host.state.view.pendingDaifugoEffect?.kind === "confirm", "8 did not enter effect confirm");
  submitSocketAction(host, { type: "answerDaifugoEffect", activate: true });
  await waitForSocket(() => host.state.view.pendingDaifugoEffect?.kind === "effectDraw", "8 did not enter effect draw");

  submitSocketAction(host, { type: "drawForDaifugoEffect" });
  await waitForSocket(() => host.state.view.pendingDaifugoEffect?.kind === "extraDiscard", "8 did not enter extra discard");
  expect(host.state.view.drawnCard).toBeTruthy();
  expect(clients[1].state.view.drawnCard).toBeNull();

  const extra = host.state.view.players[0].hand.find((card: any) => card.id !== host.state.view.drawnCard.id);
  submitSocketAction(host, { type: "discardForDaifugoEffect", cardId: extra.id });
  await waitForSocket(() => host.state.view.pendingDaifugoEffect === null, "8 extra discard did not resolve");
  expect(clients.every((client) => client.state.view.players[0].discardPile.some((card: any) => card.id === extra.id))).toBe(true);

  closeSocketClients(clients);
});
