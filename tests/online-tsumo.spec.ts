import { expect, test } from "@playwright/test";
import { getDrawnCardLabel, setupFourPlayerOnlineGame } from "./online-helpers";
import { closeSocketClients, setupSocketRoom, waitForSocket } from "./online-socket-helpers";

test("online normal tsumo is accepted by the server", async ({ browser }) => {
  const { pages } = await setupFourPlayerOnlineGame(browser, "online-tsumo-basic");
  const [host, player2, player3, player4] = pages;

  await host.getByTestId("draw-from-deck-button").click();
  await getDrawnCardLabel(host);
  await expect(host.getByTestId("drawn-card-preview")).toBeHidden({ timeout: 5_000 });
  await expect(host.getByTestId("tsumo-button").first()).toBeVisible();
  await expect(host.getByTestId("reach-button")).toHaveCount(0);
  for (const page of [player2, player3, player4]) {
    await expect(page.getByTestId("tsumo-button")).toHaveCount(0);
  }

  await host.getByTestId("tsumo-button").first().click();
  await Promise.all(pages.map((page) => expect(page.getByTestId("result-screen")).toBeVisible()));
  await expect(host.getByTestId("result-player-row").filter({ hasText: "勝者" })).toHaveCount(1);

  await Promise.all(pages.map((page) => page.close()));
});

test("online server rejects declareReach when tsumo is available", async () => {
  const clients = await setupSocketRoom("online-tsumo-basic");
  const host = clients[0];

  host.socket.emit("submitAction", {
    action: { type: "drawFromDeck" },
    stateVersion: host.state.view.stateVersion,
  });
  await waitForSocket(() => host.state.view.phase === "discard", "tsumo draw did not enter discard phase");
  expect(host.state.view.winningDiscardOptions.length).toBeGreaterThan(0);
  expect(host.state.view.canReach).toBe(false);

  host.socket.emit("submitAction", {
    action: { type: "declareReach" },
    stateVersion: host.state.view.stateVersion,
  });

  await waitForSocket(() => host.state.rejected.length > 0, "declareReach with tsumo available was not rejected");
  expect(host.state.rejected.at(-1).reason).toBe("tsumo_available_reach_not_allowed");

  closeSocketClients(clients);
});
