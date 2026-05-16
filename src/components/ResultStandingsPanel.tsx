import { useMemo } from "react";
import type { Player } from "../types";

export interface CurrentStandings {
  mode: "rounds" | "targetScore" | "startingPoints";
  values: number[];
  previousValues?: number[];
  axisMax?: number;
}

interface ResultStandingsPanelProps {
  animateToCurrent: boolean;
  isOpen: boolean;
  onClose: () => void;
  players: Player[];
  standings: CurrentStandings;
}

interface StandingRowModel {
  currentRank: number;
  currentRankIndex: number;
  currentWidthPercent: number;
  delta: number;
  deltaWidthPercent: number;
  isLeader: boolean;
  playerIndex: number;
  playerName: string;
  previousRank: number;
  previousRankIndex: number;
  previousValue: number;
  previousWidthPercent: number;
  value: number;
}

export default function ResultStandingsPanel({ animateToCurrent, isOpen, onClose, players, standings }: ResultStandingsPanelProps) {
  const model = useMemo(() => buildStandingsRaceModel(players, standings), [players, standings]);

  return (
    <section className={`standings-panel ${isOpen ? "open" : ""}`} aria-hidden={!isOpen} data-testid="current-standing-panel">
      <div className="standings-panel-ornament" aria-hidden="true" />
      <div className="standings-panel-head">
        <div>
          <p className="eyebrow">現時点の成績</p>
          <h2>{model.title}</h2>
        </div>
        <button type="button" className="standings-close-button" aria-label="成績パネルを閉じる" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="standings-axis" aria-hidden="true">
        {model.ticks.map((tick) => (
          <span key={tick} style={{ left: `${model.axisMax > 0 ? (tick / model.axisMax) * 100 : 0}%` }}>
            {tick}
          </span>
        ))}
      </div>
      <div className="standings-race" style={{ height: `${model.rows.length * 82}px` }}>
        {model.rows.map((row) => {
          const rank = animateToCurrent ? row.currentRank : row.previousRank;
          const rankIndex = animateToCurrent ? row.currentRankIndex : row.previousRankIndex;
          const displayValue = row.value;
          const isPositiveDelta = row.delta > 0;
          const isNegativeDelta = row.delta < 0;
          const baseWidth = isNegativeDelta && animateToCurrent ? row.currentWidthPercent : row.previousWidthPercent;
          const positiveDeltaWidth = isPositiveDelta && animateToCurrent ? row.deltaWidthPercent : 0;
          const negativeDeltaWidth = isNegativeDelta && animateToCurrent ? row.deltaWidthPercent : 0;

          return (
            <div
              className={`standing-race-card ${row.isLeader ? "leader" : ""}`}
              data-current-rank={row.currentRank}
              data-current-value={row.value}
              data-previous-rank={row.previousRank}
              data-previous-value={row.previousValue}
              data-testid={`standing-bar-player-${row.playerIndex + 1}`}
              key={row.playerName}
              style={{ transform: `translateY(${rankIndex * 82}px)` }}
            >
              <span className="standing-rank-badge">{rank === 1 ? "♛" : `${rank}位`}</span>
              <span className="standings-player">{row.playerName}</span>
              <div className="standings-track">
                <span className="standings-bar" style={{ width: `${baseWidth}%` }} />
                {isPositiveDelta && (
                  <span className="standings-delta-segment gain" style={{ left: `${row.previousWidthPercent}%`, width: `${positiveDeltaWidth}%` }} />
                )}
                {isNegativeDelta && (
                  <span className="standings-delta-segment loss" style={{ left: `${row.currentWidthPercent}%`, width: `${negativeDeltaWidth}%` }} />
                )}
              </div>
              <strong>
                {displayValue}点
                {row.delta !== 0 && <em>{row.delta > 0 ? `+${row.delta}点` : `${row.delta}点`}</em>}
              </strong>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function buildStandingsRaceModel(players: Player[], standings: CurrentStandings) {
  const rawRows = players.map((player, index) => ({
    playerIndex: index,
    playerName: player.name,
    previousValue: standings.previousValues?.[index] ?? standings.values[index] ?? 0,
    value: standings.values[index] ?? 0,
  }));
  const maxValue = Math.max(0, ...rawRows.map((row) => row.value), ...rawRows.map((row) => row.previousValue));
  const axisMax = standings.mode === "rounds" ? getNiceAxisMax(maxValue) : Math.max(1, standings.axisMax ?? maxValue);
  const ticks = standings.mode === "rounds" ? buildAxisTicks(axisMax) : buildFixedTicks(axisMax);
  const previousRanks = rankIndexes(rawRows, "previousValue");
  const currentRanks = rankIndexes(rawRows, "value");
  const leaderValue = Math.max(0, ...rawRows.map((row) => row.value));

  return {
    axisMax,
    ticks,
    title: standings.mode === "startingPoints" ? "現在の持ち点" : "累計得点",
    rows: rawRows.map((row): StandingRowModel => {
      const previousWidthPercent = getVisibleBarWidthPercent(row.previousValue, axisMax);
      const currentWidthPercent = getVisibleBarWidthPercent(row.value, axisMax);
      return {
        ...row,
        currentRank: currentRanks.get(row.playerIndex)! + 1,
        currentRankIndex: currentRanks.get(row.playerIndex)!,
        currentWidthPercent,
        delta: row.value - row.previousValue,
        deltaWidthPercent: Math.abs(currentWidthPercent - previousWidthPercent),
        isLeader: row.value === leaderValue && leaderValue > 0,
        previousRank: previousRanks.get(row.playerIndex)! + 1,
        previousRankIndex: previousRanks.get(row.playerIndex)!,
        previousWidthPercent,
      };
    }),
  };
}

function rankIndexes<T extends "previousValue" | "value">(rows: Array<{ playerIndex: number; previousValue: number; value: number }>, valueKey: T) {
  return new Map(
    [...rows]
      .sort((a, b) => b[valueKey] - a[valueKey] || a.playerIndex - b.playerIndex)
      .map((row, index) => [row.playerIndex, index]),
  );
}

function getVisibleBarWidthPercent(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0;
  return Math.min(100, Math.max((Math.min(value, max) / max) * 100, 5));
}

function getNiceAxisMax(value: number): number {
  if (value <= 0) return 1;

  const exponent = Math.floor(Math.log10(value));
  const base = 10 ** exponent;
  const normalized = value / base;

  let niceNormalized: number;
  if (normalized <= 1) niceNormalized = 1;
  else if (normalized <= 2) niceNormalized = 2;
  else if (normalized <= 3) niceNormalized = 3;
  else if (normalized <= 5) niceNormalized = 5;
  else niceNormalized = 10;

  return niceNormalized * base;
}

function buildAxisTicks(axisMax: number) {
  const niceMax = Math.max(1, axisMax);
  const roughStep = niceMax / 4;
  const step = getNiceStep(roughStep);
  const ticks: number[] = [];
  for (let tick = 0; tick < niceMax; tick += step) {
    ticks.push(tick);
  }
  if (ticks.at(-1) !== niceMax) ticks.push(niceMax);
  return ticks;
}

function buildFixedTicks(axisMax: number) {
  return [0, axisMax * 0.25, axisMax * 0.5, axisMax * 0.75, axisMax].map((tick) => Math.round(tick));
}

function getNiceStep(value: number) {
  if (value <= 0) return 1;

  const exponent = Math.floor(Math.log10(value));
  const base = 10 ** exponent;
  const normalized = value / base;

  if (normalized <= 1) return base;
  if (normalized <= 2) return 2 * base;
  if (normalized <= 2.5) return 2.5 * base;
  if (normalized <= 5) return 5 * base;
  return 10 * base;
}
