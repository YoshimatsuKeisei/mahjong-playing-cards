import { expect, test } from "@playwright/test";
import { closeSocketClients, setupSocketRoom, waitForSocket } from "./online-socket-helpers";

test("online reached hand rejects normal discard action", async () => {
  const clients = await setupSocketRoom("online-reach-invalid-discard");
  const host = clients[0];

  host.socket.emit("submitAction", {
    action: { type: "drawFromDeck" },
    stateVersion: host.state.view.stateVersion,
  });
  await waitForSocket(() => host.state.view.phase === "discard", "reach draw did not enter discard phase");

  const lockedCard = host.state.view.players[0].hand.find((card: any) => card.id !== host.state.view.drawnCard.id);
  host.socket.emit("submitAction", {
    action: { type: "discard", cardId: lockedCard.id },
    stateVersion: host.state.view.stateVersion,
  });

  await waitForSocket(() => host.state.rejected.length > 0, "reach locked discard was not rejected");
  expect(host.state.rejected.at(-1).reason).toBe("reach_hand_locked");
  expect(host.state.rejected.at(-1).playerView.state.phase).toBe("discard");

  closeSocketClients(clients);
});
