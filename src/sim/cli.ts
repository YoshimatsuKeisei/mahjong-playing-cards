import type { CpuModelId } from "../types";
import { runSimulation } from "./simulator";
import type { SimulationConfig, SimulationLogLevel, SimulationSummary } from "./types";

function readOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

function normalizeModel(value: string): { id: CpuModelId; label: string } {
  if (value === "easy" || value === "junior") return { id: "easy", label: "junior" };
  if (value === "standard") return { id: "standard", label: "standard" };
  if (value === "tactical" || value === "pro") return { id: "tactical", label: "pro" };
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
    lines.push(`    damageDealt=${formatNumber(player.damageDealt)}`);
    lines.push(`    netLoss=${formatNumber(player.netLoss)}`);
    lines.push(`    lossEfficiencyPerGame=${formatNumber(player.lossEfficiencyPerGame)}`);
    lines.push(`    lossEfficiencyPerTurn=${formatNumber(player.lossEfficiencyPerTurn)}`);
  });
  lines.push("", "Win method / action summary:");
  summary.players.forEach((player) => {
    lines.push(`- ${player.player}: tsumoCount=${player.tsumoCount} ronCount=${player.ronCount} callCount=${player.callCount}`);
  });
  if (summary.config.logLevel === "detail") {
    lines.push("", "Detail:");
    summary.details.forEach((detail) => {
      lines.push(
        `[game=${detail.game} seed=${detail.seed} step=${detail.step} turn=${detail.turn}] ${detail.player}/${detail.model} phase=${detail.phase} hand=[${detail.hand.join(",")}] reach=[${detail.reachPlayers.join(",")}] action=${detail.action}${detail.reason ? ` reason=${detail.reason}` : ""}`,
      );
    });
  }
  if (summary.violations.length > 0 || summary.config.logLevel === "violations") {
    lines.push("", `Violations: ${summary.violations.length}`);
    summary.violations.forEach((violation) => {
      lines.push(`[game=${violation.game} seed=${violation.seed} step=${violation.step}] ${violation.code}: ${violation.message}`);
    });
  }
  return lines.join("\n");
}

export function runCli(args: string[]): string {
  return formatSimulationSummary(runSimulation(parseSimulationArgs(args)));
}
