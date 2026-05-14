import type { GameState, RonResult } from "../types";
import { formatCard } from "./HandView";

interface ResultScreenProps {
  state: GameState;
  onRestart: () => void;
}

export default function ResultScreen({ state, onRestart }: ResultScreenProps) {
  const result = state.result!;
  const ronResults = result.winType === "ron" ? result.ronResults ?? [singleRonResult(result)] : [];
  const winner = state.players[result.winnerIndex];
  const winTypeLabel = result.winType === "tsumo" ? "ツモ" : result.winType === "ron" ? "ロン" : "山札切れ";
  const title =
    ronResults.length > 1
      ? `${ronResults.map((item) => state.players[item.winnerIndex].name).join("・")}のロン`
      : `${winner.name}の勝利`;

  return (
    <main className="screen result-screen">
      <section className="result-panel">
        <p className="eyebrow">結果</p>
        <h1>{title}</h1>
        <div className="result-summary">
          <span>{winTypeLabel}</span>
          <strong>{result.score.winnerScore}点</strong>
        </div>

        <section className="score-formula">
          <h2>得点計算</h2>
          <div className="formula-box">
            <span>{getScoreFormulaLabel(result.winType)}</span>
            <strong>{buildScoreFormula(state, result)}</strong>
          </div>
          {ronResults.length > 1 && (
            <div className="formula-breakdown">
              {ronResults.map((item) => (
                <div className="formula-row" key={item.winnerIndex}>
                  <span>{state.players[item.winnerIndex].name}</span>
                  <strong>{buildScoreFormula(state, { ...result, winnerIndex: item.winnerIndex, score: item.score })}</strong>
                </div>
              ))}
            </div>
          )}
        </section>

        {ronResults.length > 1 && (
          <section>
            <h2>ロンしたプレイヤー</h2>
            <div className="loss-list">
              {ronResults.map((item) => (
                <div className="loss-row" key={item.winnerIndex}>
                  <span>{state.players[item.winnerIndex].name}</span>
                  <strong>{item.score.winnerScore}点</strong>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2>勝ち役</h2>
          <div className="result-melds">
            {result.winningResult.melds.length === 0 ? (
              <span>山札切れのため役なし</span>
            ) : (
              result.winningResult.melds.map((meld, index) => (
                <div className="meld" key={`${index}-${meld.map((card) => card.id).join("-")}`}>
                  {meld.map(formatCard).join(" ")}
                </div>
              ))
            )}
          </div>
        </section>

        <section>
          <h2>キーカード</h2>
          <div className="key-card">{result.winningResult.keyCard ? formatCard(result.winningResult.keyCard) : "なし"}</div>
        </section>

        <section>
          <h2>各プレイヤーの失点</h2>
          <div className="loss-list">
            {state.players.map((player, index) => (
              <div className="loss-row" key={player.id}>
                <span>{player.name}</span>
                <strong>{result.score.playerLosses[index]}</strong>
              </div>
            ))}
          </div>
        </section>

        <button type="button" className="primary-button" onClick={onRestart}>
          もう一度遊ぶ
        </button>
      </section>
    </main>
  );
}

function singleRonResult(result: NonNullable<GameState["result"]>): RonResult {
  return {
    winnerIndex: result.winnerIndex,
    winningResult: result.winningResult,
    score: result.score,
  };
}

function getScoreFormulaLabel(winType: NonNullable<GameState["result"]>["winType"]) {
  if (winType === "ron") return "ロン";
  if (winType === "tsumo") return "ツモ";
  return "山札切れ";
}

function buildScoreFormula(state: GameState, result: NonNullable<GameState["result"]>) {
  const winnerLoss = result.score.playerLosses[result.winnerIndex] ?? 0;

  if (result.winType === "ron" && result.discarderIndex !== null) {
    const discarderLoss = result.score.playerLosses[result.discarderIndex] ?? 0;
    return `(${state.players[result.discarderIndex].name}の失点 ${discarderLoss} - ${state.players[result.winnerIndex].name}の失点 ${winnerLoss}) × 100 = ${result.score.winnerScore}点`;
  }

  const totalOtherLoss = result.score.playerLosses.reduce((sum, loss, index) => (index === result.winnerIndex ? sum : sum + loss), 0);
  const divisor = Math.max(1, state.players.length - 1);
  return `(他プレイヤー失点合計 ${totalOtherLoss} ÷ ${divisor} - ${state.players[result.winnerIndex].name}の失点 ${winnerLoss}) × 100 = ${result.score.winnerScore}点`;
}
