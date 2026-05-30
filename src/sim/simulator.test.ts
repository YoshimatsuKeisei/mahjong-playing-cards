import { describe, expect, it } from "vitest";
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
    expect(output).toContain("netLoss=");
    expect(output).toContain("lossEfficiencyPerGame=");
    expect(output).toContain("lossEfficiencyPerTurn=");
    expect(output).toContain("tsumoCount=");
    expect(output).toContain("ronCount=");
    expect(output).toContain("callCount=");
    expect(output).not.toContain("winRate");
    expect(output).not.toContain("averageRank");
    expect(output).not.toContain("averageScore");
    expect(output).not.toContain("averageWinningTurn");
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
