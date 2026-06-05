import { describe, expect, it } from "vitest";
import type { Card, DaifugoOptions, GameState } from "../types";
import { getDisplayedPlayerLosses, getResultLoserIndexes } from "../game/matchState";
import { gameReducer } from "../game/gameState";
import { formatSimulationSummary, parseSimulationArgs } from "./cli";
import {
  collectEffectTelemetry,
  createTurnTimingSanityCheck,
  createTurnTimingSummary,
  makePlayerSummary,
  runSimulation,
  summarizeNumberSamples,
} from "./simulator";
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

function createMasterTelemetryFixture(logLevel: SimulationConfig["logLevel"] = "violations") {
  const config = parseSimulationArgs(["--players", "master,standard,standard", "--games", "1", "--rules", "daifugo", "--seed", "1", "--logLevel", logLevel]);
  return {
    config,
    players: config.playerModels.map((_, index) => makePlayerSummary(index, config)),
    violations: [] as SimulationViolation[],
    fiveTargetEvents: [] as SimulationFiveTargetEvent[],
  };
}

function card(id: string, rank: number, suit: Card["suit"] = "S"): Card {
  return { id, rank, suit };
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
    expect(output).toContain("Turn timing summary:");
    expect(output).toContain("Turn timing sanity check:");
    expect(output).toContain("winnerCountMatchesCompletedGames=true");
    expect(output).toContain("winnerSelfTurnCountAtWin:");
    expect(output).toContain("selfTurnCountAtReach:");
    expect(output).toContain("selfTurnCountAtSecondCall:");
    expect(output).not.toContain("winRate");
    expect(output).not.toContain("averageRank");
    expect(output).not.toContain("averageScore");
    expect(output).not.toContain("averageWinningTurn");
    expect(output).not.toContain("netLoss=");
    expect(output).not.toContain("lossEfficiencyPerGame=");
    expect(output).not.toContain("lossEfficiencyPerTurn=");
  });

  it("computes turn timing percentiles and rates from per-player self turns", () => {
    expect(summarizeNumberSamples([3, 1, 10, 7])).toEqual({
      count: 4,
      avg: 5.25,
      p50: 3,
      p75: 7,
      p90: 10,
    });

    const [timing] = createTurnTimingSummary([
      {
        playerCount: 3,
        reachSelfTurnCounts: [2, null, 5],
        secondCallSelfTurnCounts: [null, 3, null],
        winners: [
          {
            playerIndex: 0,
            winType: "tsumo",
            selfTurnCountAtWin: 4,
            selfTurnCountFromReachToWin: 2,
            selfTurnCountFromSecondCallToWin: null,
          },
        ],
        globalTurnCountAtWin: 10,
        deckRemainingAtWin: 30,
        deckConsumedAtWin: 30,
      },
      {
        playerCount: 3,
        reachSelfTurnCounts: [null, null, null],
        secondCallSelfTurnCounts: [1, null, null],
        winners: [
          {
            playerIndex: 2,
            winType: "ron",
            selfTurnCountAtWin: 6,
            selfTurnCountFromReachToWin: null,
            selfTurnCountFromSecondCallToWin: null,
          },
        ],
        globalTurnCountAtWin: 14,
        deckRemainingAtWin: 20,
        deckConsumedAtWin: 40,
      },
    ]);

    expect(timing.playerCount).toBe(3);
    expect(timing.winnerSelfTurnCountAtWin).toMatchObject({ count: 2, avg: 5, p50: 4, p75: 6, p90: 6 });
    expect(timing.selfTurnCountAtReach).toMatchObject({ count: 2, avg: 3.5, p50: 2, p75: 5, p90: 5 });
    expect(timing.selfTurnCountAtSecondCall).toMatchObject({ count: 2, avg: 2, p50: 1, p75: 3, p90: 3 });
    expect(timing.selfTurnCountFromReachToWin).toMatchObject({ count: 1, avg: 2, p50: 2, p75: 2, p90: 2 });
    expect(timing.selfTurnCountFromSecondCallToWin.count).toBe(0);
    expect(timing.reachDeclaredPlayerCount).toBe(2);
    expect(timing.nonReachPlayerCount).toBe(4);
    expect(timing.reachRate).toBeCloseTo(2 / 6);
    expect(timing.secondCallReachedPlayerCount).toBe(2);
    expect(timing.nonSecondCallPlayerCount).toBe(4);
    expect(timing.secondCallRate).toBeCloseTo(2 / 6);
  });

  it("keeps winner timing to one sample per completed game for sanity checks", () => {
    const timings = [
      {
        playerCount: 3,
        reachSelfTurnCounts: [1, null, null],
        secondCallSelfTurnCounts: [null, null, null],
        winners: [
          {
            playerIndex: 0,
            winType: "ron" as const,
            selfTurnCountAtWin: 3,
            selfTurnCountFromReachToWin: 2,
            selfTurnCountFromSecondCallToWin: null,
          },
        ],
        globalTurnCountAtWin: 8,
        deckRemainingAtWin: 20,
        deckConsumedAtWin: 40,
      },
      {
        playerCount: 3,
        reachSelfTurnCounts: [null, null, null],
        secondCallSelfTurnCounts: [null, null, null],
        winners: [
          {
            playerIndex: 2,
            winType: "tsumo" as const,
            selfTurnCountAtWin: 5,
            selfTurnCountFromReachToWin: null,
            selfTurnCountFromSecondCallToWin: null,
          },
        ],
        globalTurnCountAtWin: 13,
        deckRemainingAtWin: 10,
        deckConsumedAtWin: 50,
      },
    ];
    const [timing] = createTurnTimingSummary(timings);
    const sanity = createTurnTimingSanityCheck(2, 0, timings);

    expect(timing.winnerSelfTurnCountAtWin.count).toBe(2);
    expect(sanity).toMatchObject({
      games: 2,
      deckouts: 0,
      completedGames: 2,
      winnerSelfTurnCountAtWinCount: 2,
      winnerCountMatchesCompletedGames: true,
      minWinnerSelfTurnCountAtWin: 3,
      maxWinnerSelfTurnCountAtWin: 5,
      avgGlobalTurnCountAtWin: 10.5,
      avgDeckRemainingAtWin: 15,
      avgDeckConsumedAtWin: 45,
    });
  });

  it("keeps deckout games out of win timing stats while preserving reach and second-call arrivals", () => {
    const [timing] = createTurnTimingSummary([
      {
        playerCount: 4,
        reachSelfTurnCounts: [2, null, null, null],
        secondCallSelfTurnCounts: [null, 3, null, null],
        winners: [],
        globalTurnCountAtWin: null,
        deckRemainingAtWin: null,
        deckConsumedAtWin: null,
      },
    ]);
    const sanity = createTurnTimingSanityCheck(1, 1, [
      {
        playerCount: 4,
        reachSelfTurnCounts: [2, null, null, null],
        secondCallSelfTurnCounts: [null, 3, null, null],
        winners: [],
        globalTurnCountAtWin: null,
        deckRemainingAtWin: null,
        deckConsumedAtWin: null,
      },
    ]);

    expect(timing.winnerSelfTurnCountAtWin.count).toBe(0);
    expect(timing.selfTurnCountFromReachToWin.count).toBe(0);
    expect(timing.selfTurnCountFromSecondCallToWin.count).toBe(0);
    expect(timing.selfTurnCountAtReach.count).toBe(1);
    expect(timing.selfTurnCountAtSecondCall.count).toBe(1);
    expect(sanity.winnerSelfTurnCountAtWinCount).toBe(0);
    expect(sanity.winnerCountMatchesCompletedGames).toBe(true);
  });

  it("groups timing summaries by 3, 4, and 5 player games", () => {
    const timing = createTurnTimingSummary([
      { playerCount: 3, reachSelfTurnCounts: [null, null, null], secondCallSelfTurnCounts: [null, null, null], winners: [], globalTurnCountAtWin: null, deckRemainingAtWin: null, deckConsumedAtWin: null },
      { playerCount: 4, reachSelfTurnCounts: [null, null, null, null], secondCallSelfTurnCounts: [null, null, null, null], winners: [], globalTurnCountAtWin: null, deckRemainingAtWin: null, deckConsumedAtWin: null },
      { playerCount: 5, reachSelfTurnCounts: [null, null, null, null, null], secondCallSelfTurnCounts: [null, null, null, null, null], winners: [], globalTurnCountAtWin: null, deckRemainingAtWin: null, deckConsumedAtWin: null },
    ]);

    expect(timing.map((entry) => entry.playerCount)).toEqual([3, 4, 5]);
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

  it("records J shield usage counts by actor and shield type", () => {
    const humanFixture = createTelemetryFixture();
    const humanState = createCpuScenario({
      daifugoOptions: ENABLED_DAIFUGO_OPTIONS,
      players: [{ model: "standard" }, { model: "standard" }, { model: "standard" }],
    });
    humanState.players[0] = { ...humanState.players[0], type: "human", isCpu: false, cpuModelId: undefined };
    const humanNextState: GameState = {
      ...humanState,
      players: humanState.players.map((player, index) => (index === 0 ? { ...player, jShield: { rank: 7, cardIds: ["7s", "7h", "7d"] } } : player)),
    };

    collectEffectTelemetry(humanFixture.config, 1, 1, 1, 1, humanState, { type: "selectJackShieldRank", rank: 7 }, humanNextState, humanFixture.players, humanFixture.violations);

    expect(humanFixture.players[0].jShieldUsed).toBe(1);
    expect(humanFixture.players[0].jShieldUsedByHuman).toBe(1);
    expect(humanFixture.players[0].jShieldUsedForSameRank).toBe(1);

    const masterFixture = createMasterTelemetryFixture();
    const masterState = createCpuScenario({
      daifugoOptions: ENABLED_DAIFUGO_OPTIONS,
      players: [{ model: "master" }, { model: "standard" }, { model: "standard" }],
    });
    const masterNextState: GameState = {
      ...masterState,
      players: masterState.players.map((player, index) =>
        index === 0 ? { ...player, jShield: { kind: "run", ranks: [3, 4, 5], label: "345", cardIds: ["3s", "4s", "5s"] } } : player,
      ),
    };

    collectEffectTelemetry(masterFixture.config, 1, 1, 1, 1, masterState, { type: "selectJackShieldRun", key: "3s|4s|5s" }, masterNextState, masterFixture.players, masterFixture.violations);

    expect(masterFixture.players[0].jShieldUsed).toBe(1);
    expect(masterFixture.players[0].jShieldUsedByCpu).toBe(1);
    expect(masterFixture.players[0].jShieldUsedByMaster).toBe(1);
    expect(masterFixture.players[0].jShieldUsedForSequence).toBe(1);
  });

  it("records Q blocks and partial sequence shield breaks", () => {
    const fixture = createTelemetryFixture();
    const state = withPending(
      createCpuScenario({
        daifugoOptions: ENABLED_DAIFUGO_OPTIONS,
        players: [
          {
            model: "standard",
            hand: [card("3s", 3), card("4s", 4), card("5s", 5)],
          },
          { model: "standard", hand: [card("target-4", 4)] },
          { model: "standard" },
        ],
        deck: [card("draw-1", 1)],
      }),
      { kind: "queenSelect", effect: "queenNumberVanish", playerIndex: 1, continue: { shouldConfirmReach: false } },
    );
    state.players[0] = {
      ...state.players[0],
      jShield: { kind: "run", ranks: [3, 4, 5], label: "345", cardIds: ["3s", "4s", "5s"] },
    };
    const action = { type: "selectQueenVanishRank", rank: 4 } as const;
    const nextState = gameReducer(state, action);

    collectEffectTelemetry(fixture.config, 1, 1, 1, 1, state, action, nextState, fixture.players, fixture.violations);

    expect(fixture.players[0].jShieldBlockedQ).toBe(1);
    expect(fixture.players[0].jShieldConsumed).toBe(1);
    expect(fixture.players[0].jShieldSequencePartialBrokenByQ).toBe(1);
  });

  it("records 7 exchange blocks when a shield is consumed by a decoy", () => {
    const fixture = createTelemetryFixture();
    const state = withPending(
      createCpuScenario({
        daifugoOptions: ENABLED_DAIFUGO_OPTIONS,
        players: [
          { model: "standard", hand: [card("protected-9", 9), card("decoy-4", 4)] },
          { model: "standard", hand: [card("target", 2)] },
          { model: "standard" },
        ],
      }),
      {
        kind: "sevenExchange",
        effect: "sevenExchange",
        playerIndex: 0,
        targetPlayerIndex: 1,
        selections: { 0: "protected-9" },
        continue: { shouldConfirmReach: false },
      },
    );
    state.players[0] = { ...state.players[0], jShield: { rank: 9, cardIds: ["protected-9"] } };
    const action = { type: "selectSevenExchangeCard", playerIndex: 1, cardId: "target" } as const;
    const nextState = gameReducer(state, action);

    collectEffectTelemetry(fixture.config, 1, 1, 1, 1, state, action, nextState, fixture.players, fixture.violations);

    expect(fixture.players[0].jShieldBlocked7).toBe(1);
    expect(fixture.players[0].jShieldConsumed).toBe(1);
  });

  it("records master J shield fallback to view hand with a skip reason", () => {
    const fixture = createMasterTelemetryFixture();
    const state = withPending(
      createCpuScenario({
        daifugoOptions: ENABLED_DAIFUGO_OPTIONS,
        players: [{ model: "master", hand: [card("loose-2", 2), card("loose-5", 5)] }, { model: "standard" }, { model: "standard" }],
      }),
      { kind: "confirm", effect: "jackBack", playerIndex: 0, continue: { shouldConfirmReach: false } },
    );
    const action = { type: "answerDaifugoEffect", activate: true } as const;
    const nextState = { ...state, pendingDaifugoEffect: null };

    collectEffectTelemetry(fixture.config, 1, 1, 1, 1, state, action, nextState, fixture.players, fixture.violations);

    expect(fixture.players[0].masterJSelectedViewHand).toBe(1);
    expect(fixture.players[0].masterJShieldFallbackToViewHand).toBe(1);
    expect(fixture.players[0].masterJShieldSkippedNoCompletedMeld).toBe(1);
  });

  it("records master J shields selected in a normal situation", () => {
    const fixture = createMasterTelemetryFixture();
    const state = withPending(
      createCpuScenario({
        daifugoOptions: ENABLED_DAIFUGO_OPTIONS,
        players: [{ model: "master", hand: [card("k1", 13), card("k2", 13, "H"), card("k3", 13, "D")] }, { model: "standard" }, { model: "standard" }],
      }),
      { kind: "confirm", effect: "jackBack", playerIndex: 0, continue: { shouldConfirmReach: false } },
    );
    const nextState: GameState = {
      ...state,
      pendingDaifugoEffect: null,
      players: state.players.map((player, index) => (index === 0 ? { ...player, jShield: { rank: 13, cardIds: ["k1", "k2", "k3"] } } : player)),
    };

    collectEffectTelemetry(fixture.config, 1, 1, 1, 1, state, { type: "answerDaifugoEffect", activate: true }, nextState, fixture.players, fixture.violations);

    expect(fixture.players[0].masterJSelectedShield).toBe(1);
    expect(fixture.players[0].masterJShieldUsedInNormalSituation).toBe(1);
  });

  it("prints J Shield summary in formatted simulation output", () => {
    const summary = runSimulation(parseSimulationArgs(["--players", "master,standard,standard", "--games", "1", "--rules", "daifugo", "--seed", "99"]));
    const output = formatSimulationSummary(summary);

    expect(output).toContain("J Shield summary:");
    expect(output).toContain("jShieldUsedCount=");
    expect(output).toContain("jShieldUsedByMasterCount=");
    expect(output).toContain("master decisions:");
    expect(output).toContain("masterJShieldUsedInNormalSituationCount=");
    expect(output).toContain("masterJShieldFallbackToViewHandCount=");
  });
});
