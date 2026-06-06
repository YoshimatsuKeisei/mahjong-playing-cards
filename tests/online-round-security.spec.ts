import { expect, test } from "@playwright/test";
import { closeSocketClients, setupSocketRoom, submitSocketAction, waitForSocket } from "./online-socket-helpers";

test("online round end and next round reject stale, invalid, and non-host actions", async () => {
  const clients = await setupSocketRoom("online-tsumo-basic");
  const host = clients[0];
  const guest = clients[1];

  submitSocketAction(host, { type: "drawFromDeck" });
  await waitForSocket(() => host.state.view.phase === "discard", "tsumo draw did not enter discard");
  const option = host.state.view.winningDiscardOptions[0];
  submitSocketAction(host, { type: "winWithDiscard", discardCardId: option.discardCard.id }, 0);
  await waitForSocket(() => host.state.rejected.at(-1)?.reason === "stale_state_version", "stale win action was not rejected");

  submitSocketAction(host, { type: "winWithDiscard", discardCardId: option.discardCard.id });
  await waitForSocket(() => host.state.view.phase === "result", "result did not appear");

  submitSocketAction(host, { type: "drawFromDeck" });
  await waitForSocket(() => host.state.rejected.at(-1)?.reason === "invalid_action_for_phase", "post-result draw was not rejected");

  guest.socket.emit("nextRound");
  await waitForSocket(() => guest.state.rejected.at(-1)?.reason === "not_host", "guest nextRound was not rejected");

  expect(guest.state.view.players[0].hand.every((card: any) => String(card.id).startsWith("hidden-hand-"))).toBe(true);
  expect(guest.state.matchState.gameState.players[0].hand.every((card: any) => String(card.id).startsWith("hidden-hand-"))).toBe(true);
  expect(guest.state.view.deck.length).toBe(0);

  closeSocketClients(clients);
});
