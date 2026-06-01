import { describe, expect, it } from "vitest";
import type { DaifugoOptions, GameState } from "../types";
import { getDisplayedPlayerLosses, getResultLoserIndexes } from "../game/matchState";
import { gameReducer } from "../game/gameState";
import { formatSimulationSummary, parseSimulationArgs } from "./cli";
import { collectEffectTelemetry, makePlayerSummary, runSimulation } from "./simulator";
import { createCpuScenario } from "./scenario";
import type { SimulationConfig, SimulationFiveTargetEvent, SimulationViolation } from "./types";

const ENABLED_DAIFUGO_OPTIONS: DaifugoOptions = {
  enabled: true,
  effects: {
    fiveSkip: true,
    sevenExchange: true,
    eightExtraTurn: true,
    nineReverse: true,
    tenSwapDraw: true,
    jackBack: true,
    queenNumberVanish: true,
  },
};

function createTelemetryFixture(logLevel: SimulationConfig["logLevel"] = "violations") {
  const config = parseSimulationArgs(["--players", "pro,standard,standard", "--games", "1", "--rules", "daifugo", "--seed", "1", "--logLevel", logLevel]);
  return {
    config,
    players: config.playerModels.map((_, index) => makePlayerSummary(index, config)),
    violations: [] as SimulationViolation[],
    fiveTargetEvents: [] as SimulationFiveTargetEvent[],
  };
}

function withPending(state: GameState, pendingDaifugoEffect: GameState["pendingDaifugoEffect"]): GameState {
  return { ...state, pendingDaifugoEffect };
}

describe("headless CPU simulation", () => {
  it("accepts master players in headless simulations", () => {
    const config = parseSimulationArgs(["--players", "master,standard,standard", "--games", "1", "--rules", "off", "--seed", "1"]);
    const summary = runSimulation(config);

    expect(config.playerModels).toEqual(["master", "standard", "standard"]);
    expect(summary.completedGames).toBe(1);
    expect(summary.players[0].model).toBe("master");
  });

  it("prints master unseen rank estimates only in detail events", () => {
    const summary = runSimulation(parseSimulationArgs(["--players", "master,standard,standard", "--games", "1", "--rules", "off", "--seed", "1", "--logLevel", "detail"]));
    const output = formatSimulationSummary(summary);

    expect(summary.details.some((detail) => detail.model === "master" && detail.estimatedUnseenByRank?.includes("A="))).toBe(true);
    expect(output).toContain("estimatedUnseenByRank=[");
  });

  it("replays the same simulation with a fixed seed", () => {
    const config = parseSimulationArgs(["--players", "standard,standard,pro", "--games", "3", "--rules", "daifugo", "--seed", "12345"]);
    const first = runSimulation(config);
    const second = runSimulation(config);
    expect(second.players).toEqual(first.players);
    expect(second.results).toEqual(first.results);
    expect(second.gameSeeds).toEqual(first.gameSeeds);
    expect(second.startPlayerIndexes).toEqual(first.startPlayerIndexes);
  });

  it("rotates the starting player for 3, 4, and 5 player simulations", () => {
    const threePlayers = runSimulation(parseSimulationArgs(["--players", "standard,standard,pro", "--games", "10", "--rules", "off", "--seed", "1"]));
    const fourPlayers = runSimulation(parseSimulationArgs(["--players", "standard,standard,standard,pro", "--games", "6", "--rules", "off", "--seed", "1"]));
    const fivePlayers = runSimulation(parseSimulationArgs(["--players", "standard,standard,standard,standard,pro", "--games", "7", "--rules", "off", "--seed", "1"]));

    expect(threePlayers.startPlayerIndexes).toEqual([0, 1, 2, 0, 1, 2, 0, 1, 2, 0]);
    expect(threePlayers.players.map((player) => player.startPlayerCount)).toEqual([4, 3, 3]);
    expect(fourPlayers.startPlayerIndexes).toEqual([0, 1, 2, 3, 0, 1]);
    expect(fourPlayers.players.map((player) => player.startPlayerCount)).toEqual([2, 2, 1, 1]);
    expect(fivePlayers.startPlayerIndexes).toEqual([0, 1, 2, 3, 4, 0, 1]);
    expect(fivePlayers.players.map((player) => player.startPlayerCount)).toEqual([2, 2, 1, 1, 1]);
  });

  it("prints the requested defensive and action summary without excluded main metrics", () => {
    const summary = runSimulation(parseSimulationArgs(["--players", "standard,standard,pro", "--games", "2", "--rules", "off", "--seed", "99"]));
    const output = formatSimulationSummary(summary);
    expect(summary.completedGames).toBe(2);
    expect(output).toContain("totalLoss=");
    expect(output).toContain("pureLoss=");
    expect(output).toContain("loserCount=");
    expect(output).toContain("lossEfficiency=");
    expect(output).toContain("Start player summary:");
    expect(output).toContain("- standard-1: 1");
    expect(output).toContain("- standard-2: 1");
    expect(output).toContain("winCount=");
    expect(output).toContain("tsumoCount=");
    expect(output).toContain("ronCount=");
    expect(output).toContain("callCount=");
    expect(output).toContain("use5=");
    expect(output).toContain("use7=");
    expect(output).toContain("use8=");
    expect(output).toContain("use9=");
    expect(output).toContain("use10=");
    expect(output).toContain("useJ=");
    expect(output).toContain("useQ=");
    expect(output).toContain("tacticalNormalDecisionTurns=");
    expect(output).toContain("proUsed5NoThreat=");
    expect(output).toContain("proUsed5ThreatPresentAndSkippedThreat=");
    expect(output).toContain("proUsed5ThreatPresentButDidNotSkipThreat=");
    expect(output).toContain("proUsed5ThreatPresentButCannotSkipThreat=");
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

  it("records common effect usage and tactical 5 target telemetry without changing the reducer result", () => {
    const fixture = createTelemetryFixture();
    const state = withPending(
      createCpuScenario({
        phase: "discard",
        daifugoOptions: ENABLED_DAIFUGO_OPTIONS,
        players: [
          { model: "tactical" },
          { model: "standard", isReach: true },
          { model: "standard" },
        ],
      }),
      { kind: "confirm", effect: "fiveSkip", playerIndex: 0, continue: { shouldConfirmReach: false } },
    );
    const action = { type: "answerDaifugoEffect", activate: true } as const;
    const nextState = gameReducer(state, action);

    collectEffectTelemetry(fixture.config, 1, 1, 1, 1, state, action, nextState, fixture.players, fixture.violations, fixture.fiveTargetEvents);

    expect(fixture.players[0].use5).toBe(1);
    expect(fixture.players[0].proUsed5ThreatPresentAndSkippedThreat).toBe(1);
    expect(fixture.violations).toEqual([]);
    expect(fixture.fiveTargetEvents).toEqual([
      expect.objectContaining({
        currentPlayer: "scenario-player-1",
        selectedPlayer: "scenario-player-3",
        nextPlayerBefore5: "scenario-player-2",
        nextPlayerAfter5: "scenario-player-3",
        skippedPlayers: ["scenario-player-2"],
        reachPlayers: ["scenario-player-2"],
        twoCallPlayers: [],
        threatType: "reach",
        threatTarget: "scenario-player-2",
        threatWasSkipped: true,
      }),
    ]);
    expect(nextState.phase).toBe("handoff");
    expect(nextState.lastDiscarderIndex).toBe(1);
  });

  it("records tactical 7 target telemetry from the existing exchange event", () => {
    const fixture = createTelemetryFixture();
    const state = withPending(
      createCpuScenario({
        daifugoOptions: ENABLED_DAIFUGO_OPTIONS,
        players: [
          { model: "tactical" },
          { model: "standard" },
          { model: "standard", isReach: true },
        ],
      }),
      { kind: "confirm", effect: "sevenExchange", playerIndex: 0, continue: { shouldConfirmReach: false } },
    );
    const action = { type: "answerDaifugoEffect", activate: true } as const;
    const nextState: GameState = {
      ...state,
      daifugoEffectEvent: {
        id: "seven-event",
        kind: "sevenExchange",
        actorIndex: 0,
        targetPlayerIndex: 2,
      },
    };

    collectEffectTelemetry(fixture.config, 1, 1, 1, 1, state, action, nextState, fixture.players, fixture.violations);

    expect(fixture.players[0].use7).toBe(1);
    expect(fixture.players[0].proUsed7OnReachTarget).toBe(1);
  });

  it("records an irrelevant tactical Q rank and prints compact target context only for violations mode", () => {
    const fixture = createTelemetryFixture();
    const state = withPending(
      createCpuScenario({
        daifugoOptions: ENABLED_DAIFUGO_OPTIONS,
        players: [
          { model: "tactical" },
          { model: "standard", isReach: true, hand: [{ id: "threat-four", rank: 4, suit: "S" }] },
          { model: "standard" },
        ],
      }),
      { kind: "queenSelect", effect: "queenNumberVanish", playerIndex: 0, continue: { shouldConfirmReach: false } },
    );
    const action = { type: "selectQueenVanishRank", rank: 2 } as const;

    collectEffectTelemetry(fixture.config, 1, 1, 2, 3, state, action, state, fixture.players, fixture.violations);

    expect(fixture.players[0].proUsedQOnIrrelevantRank).toBe(1);
    expect(fixture.violations).toEqual([
      expect.objectContaining({
        code: "tactical-queen-irrelevant-rank",
        turn: 3,
        effectCard: "Q",
        selectedTarget: "2",
        warningReason: "Q removed no rank held by a threat target.",
      }),
    ]);
  });

  it("does not create tactical target warnings outside violations log level", () => {
    const fixture = createTelemetryFixture("summary");
    const state = withPending(
      createCpuScenario({
        daifugoOptions: ENABLED_DAIFUGO_OPTIONS,
        players: [
          { model: "tactical" },
          { model: "standard" },
          { model: "standard", isReach: true },
        ],
      }),
      { kind: "confirm", effect: "fiveSkip", playerIndex: 0, continue: { shouldConfirmReach: false } },
    );
    const action = { type: "answerDaifugoEffect", activate: true } as const;
    const nextState = gameReducer(state, action);

    collectEffectTelemetry(fixture.config, 1, 1, 1, 1, state, action, nextState, fixture.players, fixture.violations);

    expect(fixture.players[0].proUsed5ThreatPresentButCannotSkipThreat).toBe(1);
    expect(fixture.violations).toEqual([]);
  });

  it("classifies tactical 5 without a threat separately", () => {
    const fixture = createTelemetryFixture();
    const state = withPending(
      createCpuScenario({
        daifugoOptions: ENABLED_DAIFUGO_OPTIONS,
        players: [{ model: "tactical" }, { model: "standard" }, { model: "standard" }],
      }),
      { kind: "confirm", effect: "fiveSkip", playerIndex: 0, continue: { shouldConfirmReach: false } },
    );
    const action = { type: "answerDaifugoEffect", activate: true } as const;

    collectEffectTelemetry(fixture.config, 1, 1, 1, 1, state, action, gameReducer(state, action), fixture.players, fixture.violations, fixture.fiveTargetEvents);

    expect(fixture.players[0].proUsed5NoThreat).toBe(1);
    expect(fixture.violations).toEqual([]);
    expect(fixture.fiveTargetEvents[0]).toEqual(expect.objectContaining({ threatType: "none", threatTarget: null, threatWasSkipped: false }));
  });

  it("treats a two-call player in the skipped path as a successful tactical 5 target", () => {
    const fixture = createTelemetryFixture();
    const state = withPending(
      createCpuScenario({
        daifugoOptions: ENABLED_DAIFUGO_OPTIONS,
        players: [
          { model: "tactical" },
          { model: "standard", openMelds: [[], []] },
          { model: "standard" },
        ],
      }),
      { kind: "confirm", effect: "fiveSkip", playerIndex: 0, continue: { shouldConfirmReach: false } },
    );
    const action = { type: "answerDaifugoEffect", activate: true } as const;

    collectEffectTelemetry(fixture.config, 1, 1, 1, 1, state, action, gameReducer(state, action), fixture.players, fixture.violations, fixture.fiveTargetEvents);

    expect(fixture.players[0].proUsed5ThreatPresentAndSkippedThreat).toBe(1);
    expect(fixture.fiveTargetEvents[0]).toEqual(expect.objectContaining({ threatType: "twoCall", threatTarget: "scenario-player-2", threatWasSkipped: true }));
  });

  it("warns only when tactical 5 could skip a threat but selected a path that does not", () => {
    const fixture = createTelemetryFixture();
    const state = withPending(
      createCpuScenario({
        daifugoOptions: ENABLED_DAIFUGO_OPTIONS,
        players: [
          { model: "tactical", hasJEnhancementRight: true },
          { model: "standard" },
          { model: "standard", isReach: true },
          { model: "standard" },
        ],
      }),
      { kind: "confirm", effect: "fiveSkip", playerIndex: 0, continue: { shouldConfirmReach: false } },
    );
    const action = { type: "answerDaifugoEffect", activate: true } as const;
    const nextState = { ...state, lastDiscarderIndex: 1 };

    collectEffectTelemetry(fixture.config, 1, 1, 1, 1, state, action, nextState, fixture.players, fixture.violations, fixture.fiveTargetEvents);

    expect(fixture.players[0].proUsed5ThreatPresentButDidNotSkipThreat).toBe(1);
    expect(fixture.violations).toEqual([
      expect.objectContaining({
        code: "tactical-five-did-not-skip-threat",
        selectedTarget: "scenario-player-3",
        fiveTarget: expect.objectContaining({
          skippedPlayers: ["scenario-player-2"],
          threatTarget: "scenario-player-3",
          threatWasSkipped: false,
          threatCouldBeSkipped: true,
        }),
      }),
    ]);
  });

  it("classifies tactical J fallback from reducer state changes", () => {
    const fixture = createTelemetryFixture();
    const state = withPending(
      createCpuScenario({
        daifugoOptions: ENABLED_DAIFUGO_OPTIONS,
        players: [{ model: "tactical" }, { model: "standard" }, { model: "standard" }],
      }),
      { kind: "confirm", effect: "jackBack", playerIndex: 0, continue: { shouldConfirmReach: false } },
    );
    const action = { type: "answerDaifugoEffect", activate: true } as const;
    const nextState = { ...state, isJBackActive: true };

    collectEffectTelemetry(fixture.config, 1, 1, 1, 1, state, action, nextState, fixture.players, fixture.violations);

    expect(fixture.players[0].useJ).toBe(1);
    expect(fixture.players[0].proUsedJBackFallback).toBe(1);
    expect(fixture.violations[0]).toEqual(expect.objectContaining({ code: "tactical-j-back-fallback" }));
  });
});
