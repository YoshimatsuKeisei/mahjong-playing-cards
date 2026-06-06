import { expect, test } from "@playwright/test";
import { closeSocketClients, setupSocketRoom, submitSocketAction, waitForSocket } from "./online-socket-helpers";

test("online effect actions reject wrong actor, invalid rank, invalid card, and stale version", async () => {
  const qClients = await setupSocketRoom("online-effect-invalid");
  const host = qClients[0];
  const other = qClients[1];
  const queen = host.state.view.players[0].hand.find((card: any) => card.rank === 12);

  submitSocketAction(host, { type: "discard", cardId: queen.id });
  await waitForSocket(() => host.state.view.pendingDaifugoEffect?.kind === "confirm", "Q did not enter confirm");
  submitSocketAction(host, { type: "answerDaifugoEffect", activate: true });
  await waitForSocket(() => host.state.view.pendingDaifugoEffect?.kind === "queenSelect", "Q did not enter rank select");

  submitSocketAction(other, { type: "selectQueenVanishRank", rank: 6 });
  await waitForSocket(() => other.state.rejected.length > 0, "wrong actor Q action was not rejected");
  expect(other.state.rejected.at(-1).reason).toBe("not_your_reaction");

  submitSocketAction(host, { type: "selectQueenVanishRank", rank: 14 });
  await waitForSocket(() => host.state.rejected.length > 0, "invalid Q rank was not rejected");
  expect(host.state.rejected.at(-1).reason).toBe("q_rank_not_selectable");

  submitSocketAction(host, { type: "selectQueenVanishRank", rank: 6 }, 0);
  await waitForSocket(() => host.state.rejected.at(-1)?.reason === "stale_state_version", "stale effect action was not rejected");
  closeSocketClients(qClients);

  const sevenClients = await setupSocketRoom("online-effect-7");
  const sevenHost = sevenClients[0];
  const seven = sevenHost.state.view.players[0].hand.find((card: any) => card.rank === 7);
  submitSocketAction(sevenHost, { type: "discard", cardId: seven.id });
  await waitForSocket(() => sevenHost.state.view.pendingDaifugoEffect?.kind === "confirm", "7 did not enter confirm");
  submitSocketAction(sevenHost, { type: "answerDaifugoEffect", activate: true });
  await waitForSocket(() => sevenHost.state.view.pendingDaifugoEffect?.kind === "sevenExchange", "7 did not enter exchange");
  submitSocketAction(sevenHost, { type: "selectSevenExchangeCard", playerIndex: 0, cardId: "missing-card" });
  await waitForSocket(() => sevenHost.state.rejected.length > 0, "invalid seven card was not rejected");
  expect(sevenHost.state.rejected.at(-1).reason).toBe("invalid_seven_exchange_card");
  closeSocketClients(sevenClients);

  const eightClients = await setupSocketRoom("online-effect-8");
  const eightHost = eightClients[0];
  const eight = eightHost.state.view.players[0].hand.find((card: any) => card.rank === 8);
  submitSocketAction(eightHost, { type: "discard", cardId: eight.id });
  await waitForSocket(() => eightHost.state.view.pendingDaifugoEffect?.kind === "confirm", "8 did not enter confirm");
  submitSocketAction(eightHost, { type: "answerDaifugoEffect", activate: true });
  await waitForSocket(() => eightHost.state.view.pendingDaifugoEffect?.kind === "effectDraw", "8 did not enter draw");
  submitSocketAction(eightHost, { type: "drawForDaifugoEffect" });
  await waitForSocket(() => eightHost.state.view.pendingDaifugoEffect?.kind === "extraDiscard", "8 did not enter extra discard");
  submitSocketAction(eightHost, { type: "discardForDaifugoEffect", cardId: "missing-card" });
  await waitForSocket(() => eightHost.state.rejected.length > 0, "invalid effect discard was not rejected");
  expect(eightHost.state.rejected.at(-1).reason).toBe("invalid_effect_discard_card");
  closeSocketClients(eightClients);
});
