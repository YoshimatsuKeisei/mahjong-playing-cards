import type { Card, GameResult, GameState, Player, RonResult, WinningResult } from "../types";
import { findPossibleMelds, getCardPenalty } from "../game/rules";
import { getAvatarById } from "../data/avatars";
import AvatarPreview from "./AvatarPreview";
import PlayingCard from "./PlayingCard";

interface ResultScreenProps {
  state: GameState;
  onRestart: () => void;
  onBackHome: () => void;
}

interface HandBreakdown {
  melds: Card[][];
  remainder: Card[];
}

interface FormulaPart {
  value: string;
  label?: string;
}

const resultAvatar = getAvatarById("fantasy-mage");

export default function ResultScreen({ state, onRestart, onBackHome }: ResultScreenProps) {
  const result = state.result!;
  const ronResults = result.winType === "ron" ? result.ronResults ?? [singleRonResult(result)] : [];
  const winTypeLabel = result.winType === "tsumo" ? "ツモ" : result.winType === "ron" ? "ロン" : "山札切れ";
  const winnerTitle =
    ronResults.length > 1
      ? `${ronResults.map((item) => state.players[item.winnerIndex].name).join("・")}の勝利`
      : `${state.players[result.winnerIndex].name}の勝利`;

  return (
    <main className="screen result-screen">
      <section className="result-panel result-board">
        <div className="result-round-title">1回戦</div>
        <h1 className="result-board-title result-pop-item" style={{ animationDelay: "0s" }}>
          各プレイヤーの失点
        </h1>

        <div className="player-result-list">
          {state.players.map((player, index) => {
            const breakdown = buildPlayerBreakdown(state, result, player, index);
            const label = getResultLabel(result, index);

            return (
              <section
                className={`player-result-row result-pop-item ${label === "勝者" ? "winner" : label === "敗者" ? "loser" : "normal"}`}
                style={{ animationDelay: `${0.4 + index * 0.4}s` }}
                key={player.id}
              >
                <div className="player-result-profile">
                  <div className="player-result-head">
                    <strong>{player.name}</strong>
                    {label && <em>{label}</em>}
                  </div>
                  <div className="result-avatar">
                    <AvatarPreview avatar={resultAvatar} size="small" />
                  </div>
                </div>

                <div className="player-result-cards">
                  <div className="result-hand-breakdown" aria-label={`${player.name}の手札内訳`}>
                    <div className="result-meld-column">
                      <span>できた役</span>
                      <div className="result-meld-groups">
                        {breakdown.melds.length === 0 ? (
                          <em>なし</em>
                        ) : (
                          breakdown.melds.map((meld, meldIndex) => (
                            <div className="result-card-group" key={`${player.id}-meld-${meldIndex}-${meld.map((card) => card.id).join("-")}`}>
                              {sortCardsForDisplay(meld).map((card) => (
                                <PlayingCard card={card} compact key={card.id} />
                              ))}
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="result-rest-column">
                      <span>余り札</span>
                      <div className="result-card-group">
                        {breakdown.remainder.length === 0 ? (
                          <em>なし</em>
                        ) : (
                          sortCardsForDisplay(breakdown.remainder).map((card) => <PlayingCard card={card} compact key={card.id} />)
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="player-result-score">
                  <span>失点</span>
                  <strong>{result.score.playerLosses[index]}</strong>
                </div>
              </section>
            );
          })}
        </div>

        <section className="score-result-panel result-pop-item" style={{ animationDelay: `${0.4 + state.players.length * 0.4}s` }}>
          <div className="score-result-main">
            <div className="score-method">{winTypeLabel}</div>
            <FormulaExpression parts={buildScoreFormulaParts(state, result)} />
          </div>
          <div className="score-final">
            <span>得点</span>
            <strong>{result.score.winnerScore}点</strong>
          </div>
          {ronResults.length > 1 && (
            <div className="formula-breakdown">
              {ronResults.map((item) => (
                <div className="formula-row" key={item.winnerIndex}>
                  <span>{state.players[item.winnerIndex].name}</span>
                  <FormulaExpression parts={buildScoreFormulaParts(state, { ...result, winnerIndex: item.winnerIndex, score: item.score })} />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="result-winner-call result-pop-item" style={{ animationDelay: `${0.8 + state.players.length * 0.4}s` }}>
          <p className="eyebrow">結果</p>
          <h1>
            <span className="result-trophy" aria-hidden="true">
              🏆
            </span>
            {winnerTitle}
          </h1>
        </section>

        <div className="result-actions result-pop-item" style={{ animationDelay: `${1.8 + state.players.length * 0.4}s` }}>
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

function FormulaExpression({ parts }: { parts: FormulaPart[] }) {
  return (
    <div className="formula-expression">
      {parts.map((part, index) =>
        part.label ? (
          <span className="formula-number" key={`${part.value}-${part.label}-${index}`}>
            <strong>{part.value}</strong>
            <em>{part.label}</em>
          </span>
        ) : (
          <span className="formula-symbol" key={`${part.value}-${index}`}>
            {part.value}
          </span>
        ),
      )}
    </div>
  );
}

function singleRonResult(result: NonNullable<GameState["result"]>): RonResult {
  return {
    winnerIndex: result.winnerIndex,
    winningResult: result.winningResult,
    score: result.score,
  };
}

function getResultLabel(result: GameResult, playerIndex: number) {
  const isWinner = result.ronResults?.some((item) => item.winnerIndex === playerIndex) ?? result.winnerIndex === playerIndex;
  if (isWinner) return "勝者";
  if (result.winType === "ron") return result.discarderIndex === playerIndex ? "敗者" : "";
  if (result.winType === "tsumo") return "敗者";
  return "";
}

function buildPlayerBreakdown(state: GameState, result: GameResult, player: Player, playerIndex: number): HandBreakdown {
  const winningResult = getPlayerWinningResult(result, player, playerIndex);
  if (winningResult?.canWin) {
    const ronCard = getRonCardForWinner(state, result, playerIndex);
    const sourceCards = ronCard ? [...player.hand, ronCard] : player.hand;
    return {
      melds: winningResult.melds.map(sortCardsForDisplay),
      remainder: getWinningRemainder(sourceCards, winningResult),
    };
  }

  const best = findBestDisplayMelds(player.hand, Math.max(0, 3 - player.openMelds.length));
  return {
    melds: [...player.openMelds.map(sortCardsForDisplay), ...best.melds.map(sortCardsForDisplay)],
    remainder: sortCardsForDisplay(best.remainder),
  };
}

function getPlayerWinningResult(result: GameResult, player: Player, playerIndex: number): WinningResult | null {
  const ronResult = result.ronResults?.find((item) => item.winnerIndex === playerIndex);
  if (ronResult) return ronResult.winningResult;
  if (result.winnerIndex === playerIndex) return result.winningResult;
  return player.winningResult ?? null;
}

function getRonCardForWinner(state: GameState, result: GameResult, playerIndex: number) {
  if (result.winType !== "ron") return null;
  const isRonWinner = result.ronResults?.some((item) => item.winnerIndex === playerIndex) ?? result.winnerIndex === playerIndex;
  if (!isRonWinner || result.discarderIndex === null) return null;
  return state.players[result.discarderIndex]?.discardPile.at(-1) ?? null;
}

function getWinningRemainder(cards: Card[], winningResult: WinningResult) {
  const afterMelds = removeCardsByCount(cards, winningResult.melds.flat());
  if (winningResult.keyCard && !afterMelds.some((card) => card.id === winningResult.keyCard?.id)) {
    return sortCardsForDisplay([winningResult.keyCard]);
  }
  return sortCardsForDisplay(afterMelds);
}

function findBestDisplayMelds(cards: Card[], meldsToRemove: number): HandBreakdown {
  if (meldsToRemove <= 0 || cards.length < 3) {
    return { melds: [], remainder: sortCardsForDisplay(cards) };
  }

  let best: HandBreakdown | null = null;
  for (const meld of findPossibleMelds(cards)) {
    const rest = removeCardsByCount(cards, meld);
    const child = findBestDisplayMelds(rest, meldsToRemove - 1);
    const candidate = {
      melds: [sortCardsForDisplay(meld), ...child.melds],
      remainder: child.remainder,
    };
    best = chooseBetterBreakdown(best, candidate);
  }

  return best ?? { melds: [], remainder: sortCardsForDisplay(cards) };
}

function chooseBetterBreakdown(current: HandBreakdown | null, candidate: HandBreakdown): HandBreakdown {
  if (!current) return candidate;
  if (candidate.remainder.length < current.remainder.length) return candidate;
  if (candidate.remainder.length > current.remainder.length) return current;
  return sumPenalty(candidate.remainder) < sumPenalty(current.remainder) ? candidate : current;
}

function removeCardsByCount(source: Card[], cardsToRemove: Card[]) {
  const removeCounts = new Map<string, number>();
  for (const card of cardsToRemove) {
    removeCounts.set(card.id, (removeCounts.get(card.id) ?? 0) + 1);
  }

  return source.filter((card) => {
    const count = removeCounts.get(card.id) ?? 0;
    if (count <= 0) return true;
    removeCounts.set(card.id, count - 1);
    return false;
  });
}

function sortCardsForDisplay(cards: Card[]) {
  const suitOrder: Card["suit"][] = ["S", "H", "D", "C"];
  return [...cards].sort((a, b) => a.rank - b.rank || suitOrder.indexOf(a.suit) - suitOrder.indexOf(b.suit) || a.id.localeCompare(b.id));
}

function sumPenalty(cards: Card[]) {
  return cards.reduce((sum, card) => sum + getCardPenalty(card), 0);
}

function buildScoreFormulaParts(state: GameState, result: GameResult): FormulaPart[] {
  const winnerLoss = result.score.playerLosses[result.winnerIndex] ?? 0;

  if (result.winType === "ron" && result.discarderIndex !== null) {
    const discarderLoss = result.score.playerLosses[result.discarderIndex] ?? 0;
    return [
      { value: "(" },
      { value: String(discarderLoss), label: `${state.players[result.discarderIndex].name}の失点` },
      { value: "-" },
      { value: String(winnerLoss), label: `${state.players[result.winnerIndex].name}の失点` },
      { value: ")×100=" },
      { value: String(result.score.winnerScore) },
    ];
  }

  const totalOtherLoss = result.score.playerLosses.reduce((sum, loss, index) => (index === result.winnerIndex ? sum : sum + loss), 0);
  const divisor = Math.max(1, state.players.length - 1);
  return [
    { value: "(" },
    { value: String(totalOtherLoss), label: "他プレイヤー失点合計" },
    { value: "÷" },
    { value: String(divisor), label: "人数-1" },
    { value: "-" },
    { value: String(winnerLoss), label: `${state.players[result.winnerIndex].name}の失点` },
    { value: ")×100=" },
    { value: String(result.score.winnerScore) },
  ];
}
