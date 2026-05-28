import type { MatchMode, MatchRoundHistoryEntry, MatchState, Player } from "../types";

interface FinalResultScreenProps {
  matchState: MatchState;
  players: Player[];
  onJoinAnotherMatch: () => void;
  onBackHome: () => void;
}

export interface FinalPlayerSummary {
  playerIndex: number;
  playerName: string;
  totalScore: number;
  ronWins: number;
  tsumoWins: number;
  callCount: number;
  reachCount: number;
  totalLoss: number;
  pureLoss: number;
  loserCount: number;
  lossEfficiency: number | null;
}

export interface FinalChartPoint {
  round: number;
  values: number[];
}

export interface FinalResultModel {
  matchLabel: string;
  primaryRuleLabel: string;
  endedRound: number;
  summaries: FinalPlayerSummary[];
  chartPoints: FinalChartPoint[];
}

const chartColors = ["#f2c96d", "#5ed09c", "#7fb7ff", "#ff8f70", "#d7a6ff"];

export default function FinalResultScreen({ matchState, players, onJoinAnotherMatch, onBackHome }: FinalResultScreenProps) {
  const model = buildFinalResultModel(matchState, players);
  const winnerIndex = model.summaries[0]?.playerIndex ?? 0;

  return (
    <main className="screen final-result-screen">
      <section className="final-result-panel">
        <p className="eyebrow">Final Result</p>
        <h1>最終結果</h1>
        {model.summaries[0] && (
          <div className="final-champion-banner final-pop-item" style={{ animationDelay: "0.04s" }}>
            <span aria-hidden="true">🏆</span>
            <strong>{model.summaries[0].playerName}の優勝</strong>
          </div>
        )}

        <section className="final-result-meta final-pop-item" style={{ animationDelay: "0.08s" }}>
          <div>
            <span>ルーム名</span>
            <strong>{matchState.roomName}</strong>
          </div>
          <div>
            <span>試合形式</span>
            <strong>{model.matchLabel}</strong>
          </div>
          <div>
            <span>人数</span>
            <strong>{matchState.playerCount}人</strong>
          </div>
          <div>
            <span>{model.primaryRuleLabel}</span>
            <strong>{getPrimaryRuleValue(matchState, model.endedRound)}</strong>
          </div>
          {import.meta.env.DEV && (
            <div>
              <span>DEV CPU</span>
              <strong>{matchState.cpuModelId}</strong>
            </div>
          )}
        </section>

        <section className="final-result-table-wrap final-pop-item" style={{ animationDelay: "0.16s" }}>
          <table className="final-result-table">
            <thead>
              <tr>
                <th>プレイヤー</th>
                <th>総得点</th>
                <th>ロン</th>
                <th>ツモ</th>
                <th>鳴き</th>
                <th>リーチ</th>
                <th>総失点数</th>
                <th>純失点数</th>
                <th>失点効率</th>
              </tr>
            </thead>
            <tbody>
              {model.summaries.map((summary, index) => (
                <tr className={summary.playerIndex === winnerIndex ? "champion" : ""} style={{ animationDelay: `${0.22 + index * 0.08}s` }} key={summary.playerIndex}>
                  <td>
                    <span className="final-player-name">{summary.playerIndex === winnerIndex && <b aria-hidden="true">🏆</b>}{summary.playerName}</span>
                  </td>
                  <td>{summary.totalScore}</td>
                  <td>{summary.ronWins}</td>
                  <td>{summary.tsumoWins}</td>
                  <td>{summary.callCount}</td>
                  <td>{summary.reachCount}</td>
                  <td>{summary.totalLoss}</td>
                  <td>{summary.pureLoss}</td>
                  <td>{summary.lossEfficiency === null ? "—" : summary.lossEfficiency}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="final-result-note">※ 失点効率が小さいほど、敗者時に相手へ与える点差が小さく、守備・頭脳プレーの指標になります。</p>
        </section>

        <section className="final-chart-panel final-pop-item" style={{ animationDelay: "0.26s" }}>
          <div className="final-section-heading">
            <span>得点推移</span>
            <strong>{matchState.matchMode === "startingPoints" ? "持ち点" : "累計得点"}</strong>
          </div>
          <FinalScoreChart points={model.chartPoints} players={players} />
        </section>

        <div className="final-result-actions final-pop-item" style={{ animationDelay: "0.34s" }}>
          <button type="button" className="primary-button" onClick={onJoinAnotherMatch}>
            別の試合に参加する
          </button>
          <button type="button" onClick={onBackHome}>
            ホーム画面に戻る
          </button>
        </div>
      </section>
    </main>
  );
}

export function buildFinalResultModel(matchState: MatchState, players: Player[]): FinalResultModel {
  const summaries = players.map((player, playerIndex) => buildPlayerSummary(matchState, player.name, playerIndex));
  summaries.sort((a, b) => b.totalScore - a.totalScore || a.playerIndex - b.playerIndex);

  return {
    matchLabel: getMatchLabel(matchState.matchMode),
    primaryRuleLabel: getPrimaryRuleLabel(matchState.matchMode),
    endedRound: matchState.history.at(-1)?.round ?? matchState.currentRound,
    summaries,
    chartPoints: buildChartPoints(matchState),
  };
}

function buildPlayerSummary(matchState: MatchState, playerName: string, playerIndex: number): FinalPlayerSummary {
  let ronWins = 0;
  let tsumoWins = 0;
  let callCount = 0;
  let reachCount = 0;
  let totalLoss = 0;
  let pureLoss = 0;
  let loserCount = 0;

  for (const entry of matchState.history) {
    totalLoss += entry.playerLosses[playerIndex] ?? 0;

    if (entry.result.winType === "ron") {
      const ronResults = entry.result.ronResults ?? [{ winnerIndex: entry.result.winnerIndex }];
      if (ronResults.some((result) => result.winnerIndex === playerIndex)) {
        ronWins += 1;
      }
    } else if (entry.result.winnerIndex === playerIndex) {
      tsumoWins += 1;
    }

    if (entry.loserIndexes.includes(playerIndex)) {
      pureLoss += entry.playerLosses[playerIndex] ?? 0;
      loserCount += 1;
    }

    if (entry.calledPlayerIndexes.includes(playerIndex)) callCount += 1;
    if (entry.reachPlayerIndexes.includes(playerIndex)) reachCount += 1;
  }

  const totalScore =
    matchState.matchMode === "startingPoints"
      ? matchState.pointBalances[playerIndex] ?? 0
      : matchState.cumulativeScores[playerIndex] ?? 0;

  return {
    playerIndex,
    playerName,
    totalScore,
    ronWins,
    tsumoWins,
    callCount,
    reachCount,
    totalLoss,
    pureLoss,
    loserCount,
    lossEfficiency: loserCount === 0 ? null : Math.round(pureLoss / loserCount),
  };
}

function buildChartPoints(matchState: MatchState): FinalChartPoint[] {
  const initialValues =
    matchState.matchMode === "startingPoints"
      ? Array.from({ length: matchState.playerCount }, () => matchState.startingPoints)
      : Array.from({ length: matchState.playerCount }, () => 0);

  return [
    { round: 0, values: initialValues },
    ...matchState.history.map((entry) => ({
      round: entry.round,
      values: matchState.matchMode === "startingPoints" ? entry.pointBalancesAfter : entry.cumulativeScoresAfter,
    })),
  ];
}

function FinalScoreChart({ points, players }: { points: FinalChartPoint[]; players: Player[] }) {
  const width = 720;
  const height = 220;
  const padding = { top: 14, right: 24, bottom: 30, left: 54 };
  const allValues = points.flatMap((point) => point.values);
  const minValue = Math.min(0, ...allValues);
  const maxValue = Math.max(1, ...allValues);
  const yTicks = buildChartValueTicks(minValue, maxValue);
  const chartMinValue = yTicks[0] ?? minValue;
  const chartMaxValue = yTicks[yTicks.length - 1] ?? maxValue;
  const valueRange = Math.max(1, chartMaxValue - chartMinValue);
  const maxRound = Math.max(1, ...points.map((point) => point.round));

  const x = (round: number) => padding.left + (round / maxRound) * (width - padding.left - padding.right);
  const y = (value: number) => padding.top + ((chartMaxValue - value) / valueRange) * (height - padding.top - padding.bottom);

  return (
    <div className="final-chart-scroll">
      <svg className="final-score-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="得点推移グラフ">
        <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} />
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} />
        {yTicks.map((tick) => (
          <g className="final-chart-y-tick" key={tick}>
            <line x1={padding.left} y1={y(tick)} x2={width - padding.right} y2={y(tick)} />
            <text x={padding.left - 10} y={y(tick)}>{tick}</text>
          </g>
        ))}
        {points.map((point) => (
          <g className="final-chart-tick" key={point.round}>
            <line x1={x(point.round)} y1={padding.top} x2={x(point.round)} y2={height - padding.bottom} />
            <text x={x(point.round)} y={height - 10}>{point.round === 0 ? "開始" : `${point.round}回`}</text>
          </g>
        ))}
        {players.map((player, playerIndex) => {
          const d = points.map((point, index) => `${index === 0 ? "M" : "L"} ${x(point.round)} ${y(point.values[playerIndex] ?? 0)}`).join(" ");
          const last = points[points.length - 1];
          return (
            <g key={player.id}>
              <path d={d} style={{ stroke: chartColors[playerIndex % chartColors.length] }} />
              <circle cx={x(last.round)} cy={y(last.values[playerIndex] ?? 0)} r="4" style={{ fill: chartColors[playerIndex % chartColors.length] }} />
            </g>
          );
        })}
      </svg>
      <div className="final-chart-legend">
        {players.map((player, index) => (
          <span key={player.id}>
            <i style={{ background: chartColors[index % chartColors.length] }} />
            {player.name}
          </span>
        ))}
      </div>
    </div>
  );
}

function buildChartValueTicks(minValue: number, maxValue: number) {
  const range = Math.max(1, maxValue - minValue);
  const roughStep = range / 4;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
  const start = Math.floor(minValue / step) * step;
  const end = Math.ceil(maxValue / step) * step;
  const ticks: number[] = [];
  for (let value = start; value <= end + step * 0.5; value += step) {
    ticks.push(Math.round(value));
  }
  return ticks;
}

function getMatchLabel(matchMode: MatchMode) {
  if (matchMode === "targetScore") return "目標点制";
  if (matchMode === "startingPoints") return "持ち点制";
  return "局数制";
}

function getPrimaryRuleLabel(matchMode: MatchMode) {
  if (matchMode === "targetScore") return "目標点";
  if (matchMode === "startingPoints") return "初期持ち点 / 終了回戦";
  return "全回数";
}

function getPrimaryRuleValue(matchState: MatchState, endedRound: number) {
  if (matchState.matchMode === "targetScore") return `${matchState.targetScore}点 / ${endedRound}回戦`;
  if (matchState.matchMode === "startingPoints") return `${matchState.startingPoints}点 / ${endedRound}回戦`;
  return `${endedRound}回戦`;
}
