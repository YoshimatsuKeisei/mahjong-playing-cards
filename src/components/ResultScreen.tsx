import type { GameState, RonResult } from "../types";
import { formatCard } from "./HandView";
import PlayingCard from "./PlayingCard";

interface ResultScreenProps {
  state: GameState;
  onRestart: () => void;
  onBackHome: () => void;
}

export default function ResultScreen({ state, onRestart, onBackHome }: ResultScreenProps) {
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
        <section className="result-pop" style={{ animationDelay: "0s" }}>
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

        <section className="result-pop" style={{ animationDelay: "0.18s" }}>
          <h2>キーカード</h2>
          <div className="key-card">{result.winningResult.keyCard ? formatCard(result.winningResult.keyCard) : "なし"}</div>
        </section>

        <section className="result-pop" style={{ animationDelay: "0.36s" }}>
          <h2>各プレイヤーの失点</h2>
          <div className="player-result-list">
            {state.players.map((player, index) => (
              <div className={`player-result-row ${isWinner(result, index) ? "winner" : "loser"}`} key={player.id}>
                <div className="player-result-head">
                  <span>
                    {player.name}
                    <em>{isWinner(result, index) ? "勝者" : "敗者"}</em>
                  </span>
                  <strong>{result.score.playerLosses[index]}</strong>
                </div>
                <div className="result-hand-preview" aria-label={`${player.name}の手札公開`}>
                  {player.hand.map((card) => (
                    <PlayingCard card={card} compact key={card.id} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="score-formula result-pop" style={{ animationDelay: "0.54s" }}>
          <h2>計算過程</h2>
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

        <div className="result-summary result-pop" style={{ animationDelay: "0.72s" }}>
          <span>{winTypeLabel}</span>
          <strong>{result.score.winnerScore}点</strong>
        </div>

        <section className="result-winner-call result-pop" style={{ animationDelay: "0.9s" }}>
          <p className="eyebrow">結果</p>
          <h1>{title}</h1>
        </section>

        <div className="result-actions result-pop" style={{ animationDelay: "1.08s" }}>
          <button type="button" className="primary-button" onClick={onRestart}>
            もう一度遊ぶ
          </button>
          <button type="button" onClick={onBackHome}>
            ホーム画面に戻る
          </button>
        </div>
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

function isWinner(result: NonNullable<GameState["result"]>, playerIndex: number) {
  return result.ronResults?.some((item) => item.winnerIndex === playerIndex) ?? result.winnerIndex === playerIndex;
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
