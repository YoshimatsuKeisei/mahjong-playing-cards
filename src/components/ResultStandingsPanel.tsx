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
          const displayValue = animateToCurrent ? row.value : row.previousValue;
          const isPositiveDelta = row.delta > 0;
          const isNegativeDelta = row.delta < 0;
          const baseWidth = isNegativeDelta && animateToCurrent ? row.currentWidthPercent : row.previousWidthPercent;
          const positiveDeltaWidth = isPositiveDelta && animateToCurrent ? row.deltaWidthPercent : 0;
          const negativeDeltaWidth = isNegativeDelta && animateToCurrent ? row.deltaWidthPercent : 0;
          const deltaLabel = row.delta > 0 ? `+${row.delta}点` : `${row.delta}点`;
          const isShowingPositiveDelta = isPositiveDelta && animateToCurrent;
          const isShowingNegativeDelta = isNegativeDelta && animateToCurrent;
          const deltaState = isShowingPositiveDelta ? "gain" : isShowingNegativeDelta ? "loss" : "none";

          return (
            <div
              className={`standing-race-card ${row.isLeader ? "leader" : ""} ${row.delta > 0 ? "gain" : row.delta < 0 ? "loss" : "same"}`}
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
              <div className={`standings-track delta-${deltaState}`} data-delta-state={deltaState}>
                <span className={`standings-bar ${isShowingPositiveDelta ? "connects-delta" : ""}`} style={{ width: `${baseWidth}%` }} />
                {isPositiveDelta && (
                  <span
                    className={`standings-delta-segment gain ${isShowingPositiveDelta ? "active" : ""}`}
                    style={{
                      left: isShowingPositiveDelta ? `calc(${row.previousWidthPercent}% - 1px)` : `${row.previousWidthPercent}%`,
                      width: isShowingPositiveDelta ? `calc(${positiveDeltaWidth}% + 1px)` : `${positiveDeltaWidth}%`,
                    }}
                  />
                )}
                {isNegativeDelta && (
                  <span
                    className={`standings-delta-segment loss ${isShowingNegativeDelta ? "active" : ""}`}
                    style={{
                      left: isShowingNegativeDelta ? `calc(${row.currentWidthPercent}% - 1px)` : `${row.currentWidthPercent}%`,
                      width: isShowingNegativeDelta ? `calc(${negativeDeltaWidth}% + 1px)` : `${negativeDeltaWidth}%`,
                    }}
                  />
                )}
              </div>
              <strong>
                {displayValue}点
                <em>{row.delta === 0 ? "前回比 変化なし" : `前回比 ${deltaLabel}`}</em>
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
    rows: rawRows
      .map((row): StandingRowModel => {
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
      })
      .sort((a, b) => a.currentRankIndex - b.currentRankIndex),
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
  const step = getNiceStep(value / 5);
  return Math.max(step, Math.ceil(value / step) * step);
}

function buildAxisTicks(axisMax: number) {
  const niceMax = Math.max(1, axisMax);
  const step = getNiceStep(niceMax / 5);
  const ticks: number[] = [];
  for (let tick = 0; tick < niceMax; tick += step) {
    ticks.push(tick);
  }
  if (ticks.at(-1) !== niceMax) ticks.push(niceMax);
  return ticks;
}

function buildFixedTicks(axisMax: number) {
  const max = Math.max(1, axisMax);
  const step = getNiceStep(max / 5);
  const ticks: number[] = [];
  for (let tick = 0; tick < max; tick += step) {
    ticks.push(tick);
  }
  if (ticks.at(-1) !== max) ticks.push(max);
  return ticks;
}

function getNiceStep(value: number) {
  if (value <= 0) return 1;

  const exponent = Math.floor(Math.log10(value));
  const base = 10 ** exponent;
  const normalized = value / base;

  if (normalized <= 1.5) return base;
  if (normalized <= 2) return 2 * base;
  if (normalized <= 2.5) return 2 * base;
  if (normalized <= 3) return 2.5 * base;
  if (normalized <= 5) return 5 * base;
  return 10 * base;
}
