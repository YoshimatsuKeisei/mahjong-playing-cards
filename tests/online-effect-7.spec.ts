import { expect, test } from "@playwright/test";
import { closeSocketClients, setupSocketRoom, submitSocketAction, waitForSocket } from "./online-socket-helpers";

test("online 7 effect exchanges cards without leaking other hands", async () => {
  const clients = await setupSocketRoom("online-effect-7");
  const host = clients[0];
  const target = clients[1];
  const seven = host.state.view.players[0].hand.find((card: any) => card.rank === 7);

  submitSocketAction(host, { type: "discard", cardId: seven.id });
  await waitForSocket(() => host.state.view.pendingDaifugoEffect?.kind === "confirm", "7 did not enter effect confirm");
  submitSocketAction(host, { type: "answerDaifugoEffect", activate: true });
  await waitForSocket(() => host.state.view.pendingDaifugoEffect?.kind === "sevenExchange", "7 did not enter exchange");

  expect(target.state.view.pendingDaifugoEffect?.kind).toBe("sevenExchange");
  expect(clients[2].state.view.pendingDaifugoEffect).toBeNull();
  expect(target.state.view.players[0].hand.every((card: any) => String(card.id).startsWith("hidden-hand-"))).toBe(true);

  const hostCard = host.state.view.players[0].hand[0];
  const versionBeforeHostSelection = target.state.view.stateVersion;
  submitSocketAction(host, { type: "selectSevenExchangeCard", playerIndex: 0, cardId: hostCard.id });
  await waitForSocket(() => target.state.view.stateVersion > versionBeforeHostSelection, "target did not receive exchange view");
  expect(target.state.view.pendingDaifugoEffect.selections[0]).toBe("__selected__");

  const targetCard = target.state.view.players[1].hand[0];
  submitSocketAction(target, { type: "selectSevenExchangeCard", playerIndex: 1, cardId: targetCard.id });
  await waitForSocket(() => host.state.view.daifugoEffectEvent?.kind === "sevenExchange", "7 exchange did not resolve");
  expect(clients.every((client) => client.state.view.players[0].hand.length === 10)).toBe(true);
  expect(clients.every((client) => client.state.view.players[1].hand.length === 10)).toBe(true);

  closeSocketClients(clients);
});
