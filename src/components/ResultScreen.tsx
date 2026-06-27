import { useEffect, useState } from "react";
import type { Card, GameResult, GameState, Player, RonResult, WinningResult } from "../types";
import { useRef } from "react";
import { findPossibleMelds, getCardPenalty } from "../game/rules";
import { calculatePointDeductions, calculateRawScoreFromLosses, calculateRawTsumoScoreFromLosses, calculateRawWinnerScore } from "../game/scoring";
import { getAvatarById } from "../data/avatars";
import { playCharacterVoice } from "../audio/characterVoices";
import PlayingCard from "./PlayingCard";
import ResultStandingsPanel, { type CurrentStandings } from "./ResultStandingsPanel";

type ScoreDisplayMode = "score" | "targetScore" | "startingPoints";

interface ResultScreenProps {
  state: GameState;
  playerAvatarId?: string;
  currentRound?: number;
  totalRounds?: number;
  useRawScore?: boolean;
  scoreDisplayMode?: ScoreDisplayMode;
  currentStandings?: CurrentStandings;
  onNextRound?: () => void;
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

interface DeductionRow {
  playerName: string;
  parts: FormulaPart[];
}

const MIN_RESULT_SCROLL_THUMB_PERCENT = 18;

export default function ResultScreen({
  state,
  playerAvatarId = "home-character-1",
  currentRound = 1,
  totalRounds,
  useRawScore = false,
  scoreDisplayMode,
  currentStandings,
  onNextRound,
  onRestart,
  onBackHome,
}: ResultScreenProps) {
  const [isStandingsOpen, setIsStandingsOpen] = useState(false);
  const [animateStandingsToCurrent, setAnimateStandingsToCurrent] = useState(false);
  const [resultScroller, setResultScroller] = useState<HTMLDivElement | null>(null);
  const [resultScrollBar, setResultScrollBar] = useState({
    enabled: false,
    thumbHeight: 100,
    thumbTop: 0,
  });
  const outcomeVoiceKeyRef = useRef<string | null>(null);
  const result = state.result!;
  const displayMode: ScoreDisplayMode = scoreDisplayMode ?? (useRawScore ? "targetScore" : "score");
  const isDeckout = result.winType === "deckout";
  const ronResults = result.winType === "ron" ? result.ronResults ?? [singleRonResult(result)] : [];
  const nextRound = currentRound + 1;
  const canShowNextRound = Boolean(onNextRound && (totalRounds === undefined || currentRound < totalRounds));
  const canShowStandings = Boolean(currentStandings && canShowNextRound);
  const winTypeLabel = result.winType === "tsumo" ? "ツモ" : result.winType === "ron" ? "ロン" : "流局";
  const winnerTitle = isDeckout
    ? "流局"
    : ronResults.length > 1
      ? `${ronResults.map((item) => getResultDisplayPlayerName(state.players[item.winnerIndex].name)).join("・")}の勝利`
      : `${getResultDisplayPlayerName(state.players[result.winnerIndex].name)}の勝利`;

  useEffect(() => {
    if (!result || result.winType === "deckout") return;
    const selfIndex = getResultViewerPlayerIndex(state);
    if (selfIndex < 0) return;
    const winnerIndexes =
      result.winType === "ron"
        ? (result.ronResults ?? [{ winnerIndex: result.winnerIndex }]).map((item) => item.winnerIndex)
        : [result.winnerIndex];
    const key = `${result.winType}:${winnerIndexes.join("-")}:${result.discarderIndex ?? "none"}:${selfIndex}`;
    if (outcomeVoiceKeyRef.current === key) return;
    outcomeVoiceKeyRef.current = key;
    playCharacterVoice(playerAvatarId, winnerIndexes.includes(selfIndex) ? "victory" : "defeat");
  }, [playerAvatarId, result, state]);

  const updateResultScrollBar = () => {
    if (!resultScroller) return;

    const maxScrollTop = resultScroller.scrollHeight - resultScroller.clientHeight;
    if (maxScrollTop <= 1) {
      setResultScrollBar({ enabled: false, thumbHeight: 100, thumbTop: 0 });
      return;
    }

    const thumbHeight = Math.max(
      MIN_RESULT_SCROLL_THUMB_PERCENT,
      (resultScroller.clientHeight / resultScroller.scrollHeight) * 100,
    );
    const thumbTop = (resultScroller.scrollTop / maxScrollTop) * (100 - thumbHeight);
    setResultScrollBar({ enabled: true, thumbHeight, thumbTop });
  };

  const scrollResultByTrackPosition = (clientY: number) => {
    if (!resultScroller) return;
    const track = document.querySelector<HTMLElement>(".result-custom-scrollbar-track");
    if (!track) return;
    const trackRect = track.getBoundingClientRect();
    const maxScrollTop = resultScroller.scrollHeight - resultScroller.clientHeight;
    const thumbHeightPx = (resultScrollBar.thumbHeight / 100) * trackRect.height;
    const movableTrack = Math.max(1, trackRect.height - thumbHeightPx);
    const targetTop = Math.min(
      movableTrack,
      Math.max(0, clientY - trackRect.top - thumbHeightPx / 2),
    );
    resultScroller.scrollTop = (targetTop / movableTrack) * maxScrollTop;
    updateResultScrollBar();
  };

  const handleResultScrollTrackPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!resultScroller) return;
    event.preventDefault();
    scrollResultByTrackPosition(event.clientY);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      scrollResultByTrackPosition(moveEvent.clientY);
    };
    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  const handleResultBoardWheel = (event: React.WheelEvent<HTMLElement>) => {
    if (!resultScroller) return;
    if ((event.target as Element).closest(".result-board-scroll")) return;
    resultScroller.scrollTop += event.deltaY;
    updateResultScrollBar();
  };

  useEffect(() => {
    setIsStandingsOpen(false);
  }, [currentRound, result]);

  useEffect(() => {
    updateResultScrollBar();
    const animationFrameId = window.requestAnimationFrame(updateResultScrollBar);
    const timeoutId = window.setTimeout(updateResultScrollBar, 250);
    window.addEventListener("resize", updateResultScrollBar);
    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.clearTimeout(timeoutId);
      window.removeEventListener("resize", updateResultScrollBar);
    };
  }, [currentRound, displayMode, result, resultScroller, state.players.length]);

  useEffect(() => {
    if (!isStandingsOpen) {
      setAnimateStandingsToCurrent(false);
      return;
    }

    setAnimateStandingsToCurrent(false);
    const timeoutId = window.setTimeout(() => setAnimateStandingsToCurrent(true), 120);
    return () => window.clearTimeout(timeoutId);
  }, [isStandingsOpen, currentStandings]);

  return (
    <main className="screen result-screen" data-testid="result-screen">
      <section className="result-panel result-board" onWheel={handleResultBoardWheel}>
        <div className="result-board-scroll" onScroll={updateResultScrollBar} ref={setResultScroller}>
          <div className="result-round-title">{currentRound}回戦</div>
          <h1 className="result-board-title result-pop-item" style={{ animationDelay: "0s" }}>
            各プレイヤーの失点
          </h1>

          <div className="player-result-list" data-testid="result-player-list">
            {state.players.map((player, index) => {
              const breakdown = buildPlayerBreakdown(state, result, player, index);
              const label = getResultLabel(result, index);
              const rowTone = getResultRowTone(result, index);

              return (
                <section
                  className={`player-result-row result-pop-item ${rowTone}`}
                  data-testid="result-player-row"
                  style={{ animationDelay: `${0.4 + index * 0.4}s` }}
                  key={player.id}
                >
                  <div className="player-result-profile">
                    <div className="player-result-head">
                      <strong className="result-player-name-badge">{getResultDisplayPlayerName(player.name)}</strong>
                      {label ? <em className="result-status-badge">{label}</em> : <em className="result-status-badge is-empty" aria-hidden="true" />}
                    </div>
                    <img
                      className="result-character-portrait"
                      src={getResultCharacterSrcForPlayer(state, index, playerAvatarId)}
                      alt=""
                      draggable={false}
                    />
                  </div>

                  <div className="player-result-cards">
                    <div className="result-hand-breakdown" aria-label={`${getResultDisplayPlayerName(player.name)}の手札内訳`}>
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
                    <strong>{getDisplayPlayerLoss(result, index)}</strong>
                  </div>
                </section>
              );
            })}
          </div>

          <section className="score-result-panel result-pop-item" style={{ animationDelay: `${0.4 + state.players.length * 0.4}s` }}>
            <div className="score-result-boundary" aria-hidden="true" />
            <div className="score-result-main">
              <div className="score-method"><span>{winTypeLabel}</span></div>
              {displayMode !== "startingPoints" && <FormulaExpression parts={buildScoreFormulaPartsForMode(state, result, displayMode)} />}
            </div>
            <div className="score-final">
              <span>{displayMode === "startingPoints" ? "持ち点" : "得点"}</span>
              <strong>{getDisplayFinalScore(result, state.players.length, displayMode)}点</strong>
            </div>
            {ronResults.length > 1 && displayMode !== "startingPoints" && (
              <div className="formula-breakdown">
                {ronResults.map((item) => (
                  <div className="formula-row" key={item.winnerIndex}>
                    <span>{getResultDisplayPlayerName(state.players[item.winnerIndex].name)}</span>
                    <FormulaExpression parts={buildScoreFormulaPartsForMode(state, { ...result, winnerIndex: item.winnerIndex, score: item.score }, displayMode)} />
                  </div>
                ))}
              </div>
            )}
            {displayMode === "startingPoints" && (
              <div className="formula-breakdown">
                {buildStartingPointDeductionRows(state, result).map((row) => (
                  <div className="formula-row" key={`${row.playerName}-${row.parts.map((part) => part.value).join("-")}`}>
                    <span>{row.playerName}</span>
                    <FormulaExpression parts={row.parts} />
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="result-winner-call result-pop-item" style={{ animationDelay: `${0.8 + state.players.length * 0.4}s` }}>
            <p className="eyebrow">結果</p>
            <div className="result-winner-line">
              <h1>
                <span className="result-trophy" aria-hidden="true">
                  🏆
                </span>
                {winnerTitle}
              </h1>
              {canShowStandings && (
                <button type="button" className="standings-toggle-button" onClick={() => setIsStandingsOpen(true)}>
                  現時点の成績
                </button>
              )}
            </div>
          </section>

          <div className="result-actions result-pop-item" style={{ animationDelay: `${1.8 + state.players.length * 0.4}s` }}>
            {canShowNextRound && (
              <button type="button" className="primary-button next-round-button" onClick={onNextRound}>
                {nextRound}回戦に進む
              </button>
            )}
            <button type="button" className="primary-button" onClick={onRestart}>
              やめる
            </button>
            <button type="button" onClick={onBackHome}>
              ホーム画面に戻る
            </button>
          </div>
        </div>

        <div className={`result-custom-scrollbar ${resultScrollBar.enabled ? "visible" : ""}`} aria-hidden="true">
          <div className="result-custom-scrollbar-track" onPointerDown={handleResultScrollTrackPointerDown}>
            <div
              className="result-custom-scrollbar-thumb"
              style={{
                height: `${resultScrollBar.thumbHeight}%`,
                top: `${resultScrollBar.thumbTop}%`,
              }}
            />
          </div>
        </div>

        {currentStandings && (
          <ResultStandingsPanel
            animateToCurrent={animateStandingsToCurrent}
            isOpen={isStandingsOpen}
            onClose={() => setIsStandingsOpen(false)}
            players={state.players}
            standings={currentStandings}
          />
        )}
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

function getResultDisplayPlayerName(name: string) {
  return name.replace(/^(?:Player|プレイヤー)\d+\s*[:：]\s*/, "");
}

function getResultViewerPlayerIndex(state: GameState) {
  if (state.viewerPlayerId) {
    return state.players.findIndex((player) => player.id === state.viewerPlayerId);
  }
  const humanIndex = state.players.findIndex((player) => !player.isCpu);
  return humanIndex >= 0 ? humanIndex : 0;
}

function getResultCharacterSrcForPlayer(state: GameState, playerIndex: number, playerAvatarId: string) {
  return getAvatarById(playerIndex === getResultViewerPlayerIndex(state) ? playerAvatarId : "home-character-1").imageSrc;
}

function getResultLabel(result: GameResult, playerIndex: number) {
  if (result.winType === "deckout") return "";
  const isWinner = result.ronResults?.some((item) => item.winnerIndex === playerIndex) ?? result.winnerIndex === playerIndex;
  if (isWinner) return "勝者";
  if (result.winType === "ron") return result.discarderIndex === playerIndex ? "敗者" : "";
  if (result.winType === "tsumo") return result.winnerIndex === playerIndex ? "勝者" : "敗者";
  return "";
}

function getResultRowTone(result: GameResult, playerIndex: number) {
  if (result.winType === "deckout") return "normal";
  const isWinner = result.ronResults?.some((item) => item.winnerIndex === playerIndex) ?? result.winnerIndex === playerIndex;
  if (isWinner) return "winner";
  if (result.winType === "ron") return result.discarderIndex === playerIndex ? "loser" : "normal";
  if (result.winType === "tsumo") return result.winnerIndex === playerIndex ? "winner" : "loser";
  return "normal";
}

function getDisplayPlayerLoss(result: GameResult, playerIndex: number) {
  const ronResult = result.ronResults?.find((item) => item.winnerIndex === playerIndex);
  return ronResult?.score.playerLosses[playerIndex] ?? result.score.playerLosses[playerIndex] ?? 0;
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
  if (result.winType === "deckout") return null;
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

function getDisplayFinalScore(result: GameResult, playerCount: number, mode: ScoreDisplayMode) {
  if (result.winType === "deckout") return "0";
  if (mode === "startingPoints") {
    const deduction = calculateStartingPointDisplayDeduction(result, playerCount);
    return deduction > 0 ? `-${deduction}` : "0";
  }
  return mode === "targetScore" ? calculateRawWinnerScore(result) : result.score.winnerScore;
}

function buildScoreFormulaPartsForMode(state: GameState, result: GameResult, mode: ScoreDisplayMode): FormulaPart[] {
  if (result.winType === "deckout") return [{ value: "0" }];
  if (mode === "score") return buildScoreFormulaParts(state, result);

  const winnerLoss = result.score.playerLosses[result.winnerIndex] ?? 0;
  if (result.winType === "ron" && result.discarderIndex !== null) {
    const discarderLoss = result.score.playerLosses[result.discarderIndex] ?? 0;
    return [
      { value: "(" },
      { value: String(discarderLoss), label: `${getResultDisplayPlayerName(state.players[result.discarderIndex].name)}の失点` },
      { value: "-" },
      { value: String(winnerLoss), label: `${getResultDisplayPlayerName(state.players[result.winnerIndex].name)}の失点` },
      { value: ")=" },
      { value: String(calculateRawScoreFromLosses(discarderLoss, winnerLoss)) },
    ];
  }

  const loserLosses = result.score.playerLosses.filter((_, index) => index !== result.winnerIndex);
  const divisor = Math.max(1, loserLosses.length);
  const score = calculateRawTsumoScoreFromLosses(result.score.playerLosses, result.winnerIndex);
  return [
    { value: "((" },
    ...buildLossSumParts(loserLosses, "敗者"),
    { value: ")" },
    { value: "÷" },
    { value: String(divisor), label: "敗者数" },
    { value: "-" },
    { value: String(winnerLoss), label: `${getResultDisplayPlayerName(state.players[result.winnerIndex].name)}の失点` },
    { value: ")=" },
    { value: String(score) },
  ];
}

function buildStartingPointDeductionRows(state: GameState, result: GameResult): DeductionRow[] {
  if (result.winType === "deckout") return [];
  if (result.winType === "ron" && result.discarderIndex !== null) {
    const discarderIndex = result.discarderIndex;
    const discarderName = getResultDisplayPlayerName(state.players[discarderIndex].name);
    const discarderLoss = result.score.playerLosses[discarderIndex] ?? 0;
    const ronResults = result.ronResults ?? [singleRonResult(result)];

    if (ronResults.length > 1) {
      const winnerLosses = ronResults.map((item) => item.score.playerLosses[item.winnerIndex] ?? 0);
      const winnerAverageLoss = Math.round(winnerLosses.reduce((sum, loss) => sum + loss, 0) / winnerLosses.length);
      const deduction = calculateRawScoreFromLosses(discarderLoss, winnerAverageLoss);
      return [
        {
          playerName: "勝者平均",
          parts: [
            { value: "((" },
            ...buildLossSumParts(winnerLosses, "勝者"),
            { value: ")" },
            { value: "÷" },
            { value: String(winnerLosses.length), label: "勝者数" },
            { value: "-" },
            { value: String(discarderLoss), label: `${discarderName}の失点` },
            { value: ")=" },
            { value: deduction > 0 ? `-${deduction}` : "0" },
          ],
        },
      ];
    }

    const winnerIndex = ronResults[0].winnerIndex;
    const winnerLoss = ronResults[0].score.playerLosses[winnerIndex] ?? 0;
    const deduction = calculateRawScoreFromLosses(discarderLoss, winnerLoss);
    return [
      {
        playerName: discarderName,
        parts: [
          { value: "(" },
          { value: String(winnerLoss), label: `${getResultDisplayPlayerName(state.players[winnerIndex].name)}の失点` },
          { value: "-" },
          { value: String(discarderLoss), label: `${discarderName}の失点` },
          { value: ")=" },
          { value: deduction > 0 ? `-${deduction}` : "0" },
        ],
      },
    ];
  }

  const loserLosses = result.score.playerLosses.filter((_, playerIndex) => playerIndex !== result.winnerIndex);
  const loserAverageLoss = loserLosses.length > 0 ? Math.round(loserLosses.reduce((sum, loss) => sum + loss, 0) / loserLosses.length) : 0;
  const winnerLoss = result.score.playerLosses[result.winnerIndex] ?? 0;
  const winnerName = getResultDisplayPlayerName(state.players[result.winnerIndex].name);
  const deduction = calculateRawScoreFromLosses(loserAverageLoss, winnerLoss);
  return [
    {
      playerName: "敗者平均",
      parts: [
        { value: "(" },
        { value: String(winnerLoss), label: `${winnerName}の失点` },
        { value: "-" },
        { value: "(" },
        ...buildLossSumParts(loserLosses, "敗者"),
        { value: ")" },
        { value: "÷" },
        { value: String(loserLosses.length), label: "敗者数" },
        { value: ")=" },
        { value: deduction > 0 ? `-${deduction}` : "0" },
      ],
    },
  ];
}

function calculateStartingPointDisplayDeduction(result: GameResult, playerCount: number) {
  if (result.winType === "deckout") return 0;
  if (result.winType === "ron" && result.discarderIndex !== null) {
    const ronResults = result.ronResults ?? [singleRonResult(result)];
    const discarderLoss = result.score.playerLosses[result.discarderIndex] ?? 0;
    const winnerLoss =
      ronResults.length > 1
        ? Math.round(ronResults.reduce((sum, item) => sum + (item.score.playerLosses[item.winnerIndex] ?? 0), 0) / ronResults.length)
        : ronResults[0].score.playerLosses[ronResults[0].winnerIndex] ?? 0;
    return calculateRawScoreFromLosses(discarderLoss, winnerLoss);
  }

  const deductions = calculatePointDeductions(result, playerCount);
  return Math.max(...deductions);
}

function buildLossSumParts(losses: number[], labelPrefix: string): FormulaPart[] {
  return losses.flatMap((loss, index) => [
    ...(index > 0 ? [{ value: "+" }] : []),
    { value: String(loss), label: `${labelPrefix}${index + 1}の失点` },
  ]);
}

function buildScoreFormulaParts(state: GameState, result: GameResult): FormulaPart[] {
  const winnerLoss = result.score.playerLosses[result.winnerIndex] ?? 0;

  if (result.winType === "ron" && result.discarderIndex !== null) {
    const discarderLoss = result.score.playerLosses[result.discarderIndex] ?? 0;
    return [
      { value: "(" },
      { value: String(discarderLoss), label: `${getResultDisplayPlayerName(state.players[result.discarderIndex].name)}の失点` },
      { value: "-" },
      { value: String(winnerLoss), label: `${getResultDisplayPlayerName(state.players[result.winnerIndex].name)}の失点` },
      { value: ")×100=" },
      { value: String(result.score.winnerScore) },
    ];
  }

  const loserLosses = result.score.playerLosses.filter((_, index) => index !== result.winnerIndex);
  const divisor = Math.max(1, loserLosses.length);
  return [
    { value: "((" },
    ...buildLossSumParts(loserLosses, "敗者"),
    { value: ")" },
    { value: "÷" },
    { value: String(divisor), label: "人数-1" },
    { value: "-" },
    { value: String(winnerLoss), label: `${getResultDisplayPlayerName(state.players[result.winnerIndex].name)}の失点` },
    { value: ")×100=" },
    { value: String(result.score.winnerScore) },
  ];
}
