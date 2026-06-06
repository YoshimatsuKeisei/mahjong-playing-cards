import { expect, test } from "@playwright/test";
import { setupFourPlayerOnlineGame } from "./online-helpers";

test("online Q after-effect refill win resolves instead of stalling", async ({ browser }) => {
  const { pages } = await setupFourPlayerOnlineGame(browser, "online-q-after-draw-tsumo");
  const [host, player2] = pages;

  await expect(host.getByTestId("queen-rank-9")).toBeVisible();
  await expect(player2.getByTestId("queen-rank-9")).toHaveCount(0);
  await host.getByTestId("queen-rank-9").click();

  await expect(host.getByText("Qの効果後の上がりを確認しています。")).toHaveCount(0, { timeout: 8_000 });
  await Promise.all(pages.map((page) => expect(page.getByTestId("result-screen")).toBeVisible({ timeout: 10_000 })));

  await Promise.all(pages.map((page) => page.close()));
});
