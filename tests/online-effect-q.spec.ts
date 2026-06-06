import { expect, test } from "@playwright/test";
import { closeSocketClients, setupSocketRoom, submitSocketAction, waitForSocket } from "./online-socket-helpers";

test("online Q effect exposes rank choices actor-only and masks refill details", async () => {
  const clients = await setupSocketRoom("online-effect-q");
  const host = clients[0];
  const queen = host.state.view.players[0].hand.find((card: any) => card.rank === 12);

  submitSocketAction(host, { type: "discard", cardId: queen.id });
  await waitForSocket(() => host.state.view.pendingDaifugoEffect?.kind === "confirm", "Q did not enter effect confirm");
  submitSocketAction(host, { type: "answerDaifugoEffect", activate: true });
  await waitForSocket(() => host.state.view.pendingDaifugoEffect?.kind === "queenSelect", "Q did not enter rank select");

  expect(host.state.view.queenVanishRankOptions.some((option: any) => option.selectable)).toBe(true);
  expect(clients[1].state.view.queenVanishRankOptions).toBeUndefined();

  const rank = host.state.view.queenVanishRankOptions.find((option: any) => option.selectable).rank;
  submitSocketAction(host, { type: "selectQueenVanishRank", rank });
  await waitForSocket(() => Boolean(host.state.view.daifugoEffectEvent), "Q effect did not resolve");

  const otherViewEvent = clients[1].state.view.daifugoEffectEvent;
  expect(clients.every((client) => client.state.view.deck.length === 0)).toBe(true);
  expect(otherViewEvent.queenDiscardResults.every((item: any) => item.playerIndex === 1 || item.discardedCards.length === 0)).toBe(true);

  closeSocketClients(clients);
});

test("online Q after-effect win path still resolves", async () => {
  const clients = await setupSocketRoom("online-effect-q-after-win");
  const host = clients[0];

  submitSocketAction(host, { type: "selectQueenVanishRank", rank: 9 });
  await waitForSocket(() => host.state.view.pendingDaifugoEffect?.kind === "queenWinConfirm", "Q after win confirm did not appear");
  submitSocketAction(host, { type: "answerQueenWin", takeWin: true });
  await waitForSocket(() => host.state.view.phase === "result", "Q after win did not resolve");
  expect(host.state.view.result.winType).toBe("tsumo");

  closeSocketClients(clients);
});
