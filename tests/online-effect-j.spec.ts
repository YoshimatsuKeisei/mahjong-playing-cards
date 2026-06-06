import { expect, test } from "@playwright/test";
import { closeSocketClients, setupSocketRoom, submitSocketAction, waitForSocket } from "./online-socket-helpers";

async function startJackEffect(scenario: string) {
  const clients = await setupSocketRoom(scenario);
  const host = clients[0];
  const jack = host.state.view.players[0].hand.find((card: any) => card.rank === 11);
  submitSocketAction(host, { type: "discard", cardId: jack.id });
  await waitForSocket(() => host.state.view.pendingDaifugoEffect?.kind === "confirm", "J did not enter effect confirm");
  submitSocketAction(host, { type: "answerDaifugoEffect", activate: true });
  await waitForSocket(() => host.state.view.pendingDaifugoEffect?.kind === "jackSelect", "J did not enter special effect select");
  return { clients, host };
}

test("online J enhancement is actor-only and becomes server state", async () => {
  const { clients, host } = await startJackEffect("online-effect-j-enhance");

  expect(clients[1].state.view.pendingDaifugoEffect).toBeNull();
  submitSocketAction(host, { type: "selectJackSpecialEffect", effect: "enhanceFiveOrSeven" });
  await waitForSocket(() => host.state.view.players[0].hasJEnhancementRight === true, "J enhancement did not resolve");

  closeSocketClients(clients);
});

test("online J hand inspect reveals only to the actor", async () => {
  const { clients, host } = await startJackEffect("online-effect-j-view");

  submitSocketAction(host, { type: "selectJackSpecialEffect", effect: "inspectHands" });
  await waitForSocket(() => host.state.view.pendingDaifugoEffect?.kind === "jackInspect", "J inspect did not start");
  expect(clients[1].state.view.pendingDaifugoEffect).toBeNull();

  const targetIndex = host.state.view.pendingDaifugoEffect.targetPlayerIndexes[host.state.view.pendingDaifugoEffect.currentTargetOffset];
  const inspectCard = host.state.view.players[targetIndex].hand[0];
  expect(inspectCard.rank).toBe(0);
  submitSocketAction(host, { type: "inspectJackCard", targetPlayerIndex: targetIndex, cardId: inspectCard.id });
  await waitForSocket(() => host.state.view.players[targetIndex].hand.some((card: any) => card.id === inspectCard.id && card.rank > 0), "J inspect did not reveal card");
  const thirdParty = clients.find((_, index) => index !== 0 && index !== targetIndex)!;
  expect(thirdParty.state.view.players[targetIndex].hand.every((card: any) => String(card.id).startsWith("hidden-hand-"))).toBe(true);

  closeSocketClients(clients);
});

test("online J shield detail is visible only to the owner", async () => {
  const { clients, host } = await startJackEffect("online-effect-j-shield");

  submitSocketAction(host, { type: "selectJackSpecialEffect", effect: "jShield" });
  await waitForSocket(() => host.state.view.pendingDaifugoEffect?.kind === "jackShieldSelect", "J shield select did not start");
  submitSocketAction(host, { type: "selectJackShieldRank", rank: 5 });
  await waitForSocket(() => Boolean(host.state.view.players[0].jShield), "J shield did not resolve");

  expect(host.state.view.players[0].jShield.rank).toBe(5);
  expect(clients[1].state.view.players[0].jShield).toBeUndefined();

  closeSocketClients(clients);
});
