import { expect, test } from "@playwright/test";
import { closeSocketClients, setupSocketRoom, waitForSocket } from "./online-socket-helpers";

test("online reached player cannot call even with matching hand", async () => {
  const clients = await setupSocketRoom("online-reach-cannot-call");
  const reached = clients[1];

  expect(reached.state.view.players[1].isReach).toBe(true);
  expect(reached.state.view.reaction).toBeNull();
  const discard = reached.state.view.players[0].discardPile.at(-1);
  const hand = reached.state.view.players[1].hand;

  reached.socket.emit("submitAction", {
    action: { type: "takeDiscard", ownerIndex: 0, meld: [hand[0], hand[1], discard] },
    stateVersion: reached.state.view.stateVersion,
  });

  await waitForSocket(() => reached.state.rejected.length > 0, "reach call was not rejected");
  expect(reached.state.rejected.at(-1).reason).toBe("reach_player_cannot_call");

  closeSocketClients(clients);
});
