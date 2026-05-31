import { describe, expect, it } from "vitest";
import { getDisplayedPlayerLosses, getResultLoserIndexes } from "../game/matchState";
import { formatSimulationSummary, parseSimulationArgs } from "./cli";
import { runSimulation } from "./simulator";

describe("headless CPU simulation", () => {
  it("replays the same simulation with a fixed seed", () => {
    const config = parseSimulationArgs(["--players", "standard,standard,pro", "--games", "3", "--rules", "daifugo", "--seed", "12345"]);
    const first = runSimulation(config);
    const second = runSimulation(config);
    expect(second.players).toEqual(first.players);
    expect(second.results).toEqual(first.results);
    expect(second.gameSeeds).toEqual(first.gameSeeds);
  });

  it("prints the requested defensive and action summary without excluded main metrics", () => {
    const summary = runSimulation(parseSimulationArgs(["--players", "standard,standard,pro", "--games", "2", "--rules", "off", "--seed", "99"]));
    const output = formatSimulationSummary(summary);
    expect(summary.completedGames).toBe(2);
    expect(output).toContain("totalLoss=");
    expect(output).toContain("pureLoss=");
    expect(output).toContain("loserCount=");
    expect(output).toContain("lossEfficiency=");
    expect(output).toContain("winCount=");
    expect(output).toContain("tsumoCount=");
    expect(output).toContain("ronCount=");
    expect(output).toContain("callCount=");
    expect(output).not.toContain("winRate");
    expect(output).not.toContain("averageRank");
    expect(output).not.toContain("averageScore");
    expect(output).not.toContain("averageWinningTurn");
    expect(output).not.toContain("netLoss=");
    expect(output).not.toContain("lossEfficiencyPerGame=");
    expect(output).not.toContain("lossEfficiencyPerTurn=");
  });

  it("uses the final-result definitions for losses and efficiency", () => {
    const summary = runSimulation(parseSimulationArgs(["--players", "standard,standard,pro", "--games", "10", "--rules", "daifugo", "--seed", "12345"]));

    summary.players.forEach((player, playerIndex) => {
      const expected = summary.results.reduce(
        (acc, result) => {
          const playerLosses = getDisplayedPlayerLosses(result, summary.players.length);
          const isLoser = getResultLoserIndexes(result, summary.players.length).includes(playerIndex);
          return {
            totalLoss: acc.totalLoss + (playerLosses[playerIndex] ?? 0),
            pureLoss: acc.pureLoss + (isLoser ? (playerLosses[playerIndex] ?? 0) : 0),
            loserCount: acc.loserCount + (isLoser ? 1 : 0),
          };
        },
        { totalLoss: 0, pureLoss: 0, loserCount: 0 },
      );

      expect(player.totalLoss).toBe(expected.totalLoss);
      expect(player.pureLoss).toBe(expected.pureLoss);
      expect(player.loserCount).toBe(expected.loserCount);
      expect(player.lossEfficiency).toBe(expected.loserCount === 0 ? null : Math.round(expected.pureLoss / expected.loserCount));
      expect(player.winCount).toBe(player.tsumoCount + player.ronCount);
    });
  });

  it("supports detail and violations log levels plus rules ON/OFF", () => {
    const detail = runSimulation(parseSimulationArgs(["--games", "1", "--seed", "7", "--logLevel", "detail", "--rules", "daifugo"]));
    const violations = parseSimulationArgs(["--games", "1", "--seed", "7", "--logLevel", "violations", "--rules", "off"]);
    expect(detail.daifugoOptions.enabled).toBe(true);
    expect(detail.details.length).toBeGreaterThan(0);
    expect(violations.logLevel).toBe("violations");
    expect(violations.rules).toBe("off");
  });

  it("records a max-step violation without hanging", () => {
    const summary = runSimulation(parseSimulationArgs(["--games", "1", "--seed", "7", "--maxSteps", "1", "--logLevel", "violations"]));
    expect(summary.violations).toEqual([
      expect.objectContaining({
        code: "max-steps",
        game: 1,
      }),
    ]);
  });
});
