import type { CpuModelId } from "../types";
import { runSimulation } from "./simulator";
import type { SimulationConfig, SimulationLogLevel, SimulationNumberStats, SimulationSummary } from "./types";

function readOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

function normalizeModel(value: string): { id: CpuModelId; label: string } {
  if (value === "easy" || value === "junior") return { id: "easy", label: "junior" };
  if (value === "standard") return { id: "standard", label: "standard" };
  if (value === "tactical" || value === "pro") return { id: "tactical", label: "pro" };
  if (value === "master") return { id: "master", label: "master" };
  throw new Error(`Unknown CPU model: ${value}`);
}

function parsePositiveInt(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`--${name} must be a positive integer.`);
  return parsed;
}

export function parseSimulationArgs(args: string[]): SimulationConfig {
  const models = (readOption(args, "players") ?? "standard,standard,pro").split(",").map((value) => normalizeModel(value.trim()));
  if (models.length < 3 || models.length > 5) throw new Error("--players must contain 3 to 5 CPU models.");
  const rules = readOption(args, "rules") ?? "daifugo";
  if (rules !== "daifugo" && rules !== "off") throw new Error("--rules must be daifugo or off.");
  const logLevel = readOption(args, "logLevel") ?? "summary";
  if (logLevel !== "summary" && logLevel !== "detail" && logLevel !== "violations") throw new Error("--logLevel must be summary, detail, or violations.");
  return {
    playerModels: models.map((model) => model.id),
    playerLabels: models.map((model, index) => `${model.label}-${index + 1}`),
    games: parsePositiveInt(readOption(args, "games"), 10, "games"),
    rules,
    seed: parsePositiveInt(readOption(args, "seed"), Date.now() >>> 0 || 1, "seed"),
    logLevel: logLevel as SimulationLogLevel,
    direction: readOption(args, "direction") === "counterclockwise" ? "counterclockwise" : "clockwise",
    maxStepsPerGame: parsePositiveInt(readOption(args, "maxSteps"), 10_000, "maxSteps"),
  };
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(4);
}

function formatOptionalNumber(value: number | null): string {
  return value === null ? "-" : formatNumber(value);
}

function formatTimingStats(name: string, stats: SimulationNumberStats, suffix = ""): string {
  return `${name}: count=${stats.count} avg=${formatOptionalNumber(stats.avg)} p50=${formatOptionalNumber(stats.p50)} p75=${formatOptionalNumber(stats.p75)} p90=${formatOptionalNumber(stats.p90)}${suffix}`;
}

export function formatSimulationSummary(summary: SimulationSummary): string {
  const lines = [
    "Simulation completed.",
    `Rules: daifugo ${summary.config.rules === "daifugo" ? "ON" : "OFF"}`,
    `Players: ${summary.config.playerLabels.join(", ")}`,
    `Games: ${summary.completedGames}`,
    `Seed: ${summary.config.seed}`,
    `Deckouts: ${summary.deckoutCount}`,
    "",
    "Loss summary:",
  ];
  summary.players.forEach((player) => {
    lines.push(`- ${player.player}:`);
    lines.push(`    totalLoss=${formatNumber(player.totalLoss)}`);
    lines.push(`    pureLoss=${formatNumber(player.pureLoss)}`);
    lines.push(`    loserCount=${player.loserCount}`);
    lines.push(`    lossEfficiency=${player.lossEfficiency === null ? "-" : formatNumber(player.lossEfficiency)}`);
  });
  lines.push("", "Start player summary:");
  summary.players.forEach((player) => {
    lines.push(`- ${player.player}: ${player.startPlayerCount}`);
  });
  lines.push("", "Win method / action summary:");
  summary.players.forEach((player) => {
    lines.push(`- ${player.player}: winCount=${player.winCount} tsumoCount=${player.tsumoCount} ronCount=${player.ronCount} callCount=${player.callCount}`);
    lines.push(`    use5=${player.use5} use7=${player.use7} use8=${player.use8} use9=${player.use9} use10=${player.use10} useJ=${player.useJ} useQ=${player.useQ}`);
  });
  const tacticalPlayers = summary.players.filter((player) => player.model === "tactical" || player.model === "master");
  if (tacticalPlayers.length > 0) {
    lines.push("", "Tactical effect target summary:");
    tacticalPlayers.forEach((player) => {
      lines.push(`- ${player.player}:`);
      lines.push(`    tacticalNormalDecisionTurns=${player.tacticalNormalDecisionTurns} tacticalReachDecisionTurns=${player.tacticalReachDecisionTurns} tacticalTwoCallDecisionTurns=${player.tacticalTwoCallDecisionTurns}`);
      lines.push(`    proUsed5NoThreat=${player.proUsed5NoThreat} proUsed5ThreatPresentAndSkippedThreat=${player.proUsed5ThreatPresentAndSkippedThreat} proUsed5ThreatPresentButDidNotSkipThreat=${player.proUsed5ThreatPresentButDidNotSkipThreat} proUsed5ThreatPresentButCannotSkipThreat=${player.proUsed5ThreatPresentButCannotSkipThreat}`);
      lines.push(`    proUsed7OnReachTarget=${player.proUsed7OnReachTarget} proUsed7OnTwoCallTarget=${player.proUsed7OnTwoCallTarget} proUsed7OnIrrelevantTarget=${player.proUsed7OnIrrelevantTarget}`);
      lines.push(`    proUsedQOnReachRelatedRank=${player.proUsedQOnReachRelatedRank} proUsedQOnTwoCallRelatedRank=${player.proUsedQOnTwoCallRelatedRank} proUsedQOnIrrelevantRank=${player.proUsedQOnIrrelevantRank}`);
      lines.push(`    proUsed9ToIncreaseReachDistance=${player.proUsed9ToIncreaseReachDistance} proUsed9ToIncreaseTwoCallDistance=${player.proUsed9ToIncreaseTwoCallDistance} proUsed9WithoutDistanceGain=${player.proUsed9WithoutDistanceGain}`);
      lines.push(`    proUsedJForEnhancement=${player.proUsedJForEnhancement} proUsedJForView=${player.proUsedJForView} proUsedJBackFallback=${player.proUsedJBackFallback}`);
    });
  }
  lines.push("", "Turn timing sanity check:");
  lines.push(`games=${summary.turnTimingSanity.games}`);
  lines.push(`deckouts=${summary.turnTimingSanity.deckouts}`);
  lines.push(`completedGames=${summary.turnTimingSanity.completedGames}`);
  lines.push(`winnerSelfTurnCountAtWin.count=${summary.turnTimingSanity.winnerSelfTurnCountAtWinCount}`);
  lines.push(`winnerCountMatchesCompletedGames=${summary.turnTimingSanity.winnerCountMatchesCompletedGames}`);
  lines.push(`minWinnerSelfTurnCountAtWin=${formatOptionalNumber(summary.turnTimingSanity.minWinnerSelfTurnCountAtWin)}`);
  lines.push(`maxWinnerSelfTurnCountAtWin=${formatOptionalNumber(summary.turnTimingSanity.maxWinnerSelfTurnCountAtWin)}`);
  lines.push(`avgGlobalTurnCountAtWin=${formatOptionalNumber(summary.turnTimingSanity.avgGlobalTurnCountAtWin)}`);
  lines.push(`avgDeckRemainingAtWin=${formatOptionalNumber(summary.turnTimingSanity.avgDeckRemainingAtWin)}`);
  lines.push(`avgDeckConsumedAtWin=${formatOptionalNumber(summary.turnTimingSanity.avgDeckConsumedAtWin)}`);
  if (summary.turnTiming.length > 0) {
    lines.push("", "Turn timing summary:");
    summary.turnTiming.forEach((timing) => {
      lines.push(`players=${timing.playerCount}`);
      lines.push(formatTimingStats("winnerSelfTurnCountAtWin", timing.winnerSelfTurnCountAtWin));
      lines.push(
        formatTimingStats(
          "selfTurnCountAtReach",
          timing.selfTurnCountAtReach,
          ` reachDeclaredPlayerCount=${timing.reachDeclaredPlayerCount} nonReachPlayerCount=${timing.nonReachPlayerCount} reachRate=${formatNumber(timing.reachRate)}`,
        ),
      );
      lines.push(formatTimingStats("selfTurnCountFromReachToWin", timing.selfTurnCountFromReachToWin));
      lines.push(formatTimingStats("reachToTsumoWinSelfTurnCount", timing.reachToTsumoWinSelfTurnCount));
      lines.push(formatTimingStats("reachToRonWinSelfTurnCount", timing.reachToRonWinSelfTurnCount));
      lines.push(
        formatTimingStats(
          "selfTurnCountAtSecondCall",
          timing.selfTurnCountAtSecondCall,
          ` secondCallReachedPlayerCount=${timing.secondCallReachedPlayerCount} nonSecondCallPlayerCount=${timing.nonSecondCallPlayerCount} secondCallRate=${formatNumber(timing.secondCallRate)}`,
        ),
      );
      lines.push(formatTimingStats("selfTurnCountFromSecondCallToWin", timing.selfTurnCountFromSecondCallToWin));
      lines.push(formatTimingStats("secondCallToTsumoWinSelfTurnCount", timing.secondCallToTsumoWinSelfTurnCount));
      lines.push(formatTimingStats("secondCallToRonWinSelfTurnCount", timing.secondCallToRonWinSelfTurnCount));
    });
  }
  if (summary.config.logLevel === "detail") {
    lines.push("", "Detail:");
    summary.details.forEach((detail) => {
      lines.push(
        `[game=${detail.game} seed=${detail.seed} step=${detail.step} turn=${detail.turn}] ${detail.player}/${detail.model} phase=${detail.phase} hand=[${detail.hand.join(",")}] reach=[${detail.reachPlayers.join(",")}] action=${detail.action}${detail.estimatedUnseenByRank ? ` estimatedUnseenByRank=[${detail.estimatedUnseenByRank}]` : ""}${detail.reason ? ` reason=${detail.reason}` : ""}`,
      );
    });
    lines.push("", "Tactical 5 target detail:");
    summary.fiveTargetEvents.forEach((event) => {
      lines.push(
        `[game=${event.game} seed=${event.seed} step=${event.step} turn=${event.turn}] current=${event.currentPlayer} order=[${event.turnOrder.join(",")}] selected=${event.selectedPlayer} before=${event.nextPlayerBefore5} after=${event.nextPlayerAfter5} skipped=[${event.skippedPlayers.join(",")}] reach=[${event.reachPlayers.join(",")}] twoCall=[${event.twoCallPlayers.join(",")}] threatType=${event.threatType} threat=${event.threatTarget ?? "-"} threatWasSkipped=${event.threatWasSkipped} threatCouldBeSkipped=${event.threatCouldBeSkipped}`,
      );
    });
  }
  if (summary.violations.length > 0 || summary.config.logLevel === "violations") {
    lines.push("", `Violations: ${summary.violations.length}`);
    summary.violations.forEach((violation) => {
      const telemetry =
        violation.turn === undefined
          ? ""
          : ` turn=${violation.turn} cpu=${violation.cpu ?? "-"} effect=${violation.effectCard ?? "-"} reach=[${violation.reachPlayers?.join(",") ?? ""}] calls=[${violation.callCounts?.join(",") ?? ""}] threat=[${violation.threatTargets?.join(",") ?? ""}] selected=${violation.selectedTarget ?? "-"} warning=${violation.warningReason ?? violation.message}`;
      const fiveTarget = violation.fiveTarget
        ? ` order=[${violation.fiveTarget.turnOrder.join(",")}] before=${violation.fiveTarget.nextPlayerBefore5} after=${violation.fiveTarget.nextPlayerAfter5} skipped=[${violation.fiveTarget.skippedPlayers.join(",")}] twoCall=[${violation.fiveTarget.twoCallPlayers.join(",")}] threatType=${violation.fiveTarget.threatType} threatWasSkipped=${violation.fiveTarget.threatWasSkipped}`
        : "";
      lines.push(`[game=${violation.game} seed=${violation.seed} step=${violation.step}${telemetry}${fiveTarget}] ${violation.code}: ${violation.message}`);
    });
  }
  return lines.join("\n");
}

export function runCli(args: string[]): string {
  return formatSimulationSummary(runSimulation(parseSimulationArgs(args)));
}
