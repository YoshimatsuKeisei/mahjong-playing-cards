import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type Dispatch } from "react";
import { canDeclareReachAfterDraw, checkWinningHandWithOpenMelds } from "../game/rules";
import {
  getAvailableDiscardSources,
  getCallOptionsForSource,
  getReachWinningOptions,
  type GameAction,
} from "../game/gameState";
import type { Card, GameState } from "../types";
import DiscardPile from "./DiscardPile";
import HandView from "./HandView";
import MeldArea from "./MeldArea";
import PlayerArea from "./PlayerArea";
import PlayingCard, { formatCard } from "./PlayingCard";

interface PlayScreenProps {
  state: GameState;
  dispatch: Dispatch<GameAction>;
  currentRound?: number;
}

type AnimationPhase = "idle" | "drawingFromDeck" | "revealingDrawnCard" | "movingDrawnCardToHand" | "discardingCard";

const reachVisualSrc = new URL("../../黒ローブ男.png", import.meta.url).href;

const seatPositions: Record<number, Array<{ left: string; top: string }>> = {
  3: [
    { left: "50%", top: "82%" },
    { left: "76%", top: "34%" },
    { left: "24%", top: "34%" },
  ],
  4: [
    { left: "57%", top: "24%" },
    { left: "80%", top: "47%" },
    { left: "50%", top: "84%" },
    { left: "20%", top: "47%" },
  ],
  5: [
    { left: "36%", top: "25%" },
    { left: "64%", top: "25%" },
    { left: "78%", top: "54%" },
    { left: "50%", top: "82%" },
    { left: "22%", top: "54%" },
  ],
};

const historyAnchorPositions: Record<number, Array<{ left: string; top: string }>> = {
  3: [
    { left: "63.4%", top: "74.2%" },
    { left: "63.4%", top: "55.6%" },
    { left: "40.8%", top: "54.8%" },
  ],
  4: [
    { left: "50%", top: "31%" },
    { left: "84%", top: "52%" },
    { left: "63%", top: "84%" },
    { left: "16%", top: "52%" },
  ],
  5: [
    { left: "36.8%", top: "31.4%" },
    { left: "63.2%", top: "31.4%" },
    { left: "81.4%", top: "58.9%" },
    { left: "62%", top: "82%" },
    { left: "18.6%", top: "58.9%" },
  ],
};

const measuredAnchorLayouts: Record<number, Array<{ left: string; top: string; width: string; height: string }>> = {
  4: [
    { left: "45%", top: "28%", width: "10%", height: "10%" },
    { left: "79%", top: "45%", width: "10%", height: "18%" },
    { left: "61%", top: "80%", width: "5%", height: "8%" },
    { left: "11%", top: "45%", width: "10%", height: "18%" },
  ],
  5: [
    { left: "31%", top: "26%", width: "15%", height: "14%" },
    { left: "54%", top: "26%", width: "15%", height: "14%" },
    { left: "77%", top: "43%", width: "11%", height: "25%" },
    { left: "61%", top: "78%", width: "5%", height: "8%" },
    { left: "12%", top: "43%", width: "11%", height: "25%" },
  ],
};

export default function PlayScreen({ state, dispatch, currentRound }: PlayScreenProps) {
  const currentPlayer = state.players[state.currentPlayerIndex];
  const reachOptions = getReachWinningOptions(state);
  const discardSources = getAvailableDiscardSources(state);
  const discardHighlights = getDiscardHighlights(state, discardSources);
  const playerCount = state.players.length;
  const showTableCardLayer = playerCount === 3;
  const canReachAfterDraw =
    state.phase === "discard" &&
    state.drawnFrom === "deck" &&
    canDeclareReachAfterDraw(currentPlayer.hand, currentPlayer.hasCalled, currentPlayer.isReach);
  const canChooseDiscard = !currentPlayer.isReach || state.declaredReachThisTurn;
  const [animationPhase, setAnimationPhase] = useState<AnimationPhase>("idle");
  const [animationCard, setAnimationCard] = useState<Card | null>(null);
  const [selectedDiscardId, setSelectedDiscardId] = useState<string | null>(null);
  const [discardingCardId, setDiscardingCardId] = useState<string | null>(null);
  const [reachSplashPlayerName, setReachSplashPlayerName] = useState<string | null>(null);
  const [ronCountdown, setRonCountdown] = useState(3);
  const sceneRef = useRef<HTMLElement | null>(null);
  const historyMeasureRefs = useRef(new Map<number, HTMLElement>());
  const [measuredHistoryPositions, setMeasuredHistoryPositions] = useState<Record<number, { left: string; top: string }>>({});
  const timeoutsRef = useRef<number[]>([]);
  const reachSplashTimeoutRef = useRef<number | null>(null);
  const isAnimating = animationPhase !== "idle";
  const pendingRonResult = state.pendingRonResult;
  const ronDiscarderIndex = pendingRonResult?.discarderIndex ?? null;
  const ronDiscarder = ronDiscarderIndex !== null ? state.players[ronDiscarderIndex] : null;
  const ronCard = ronDiscarder?.discardPile.at(-1) ?? null;
  const ronWinners = pendingRonResult?.ronResults ?? [];

  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(window.clearTimeout);
      if (reachSplashTimeoutRef.current !== null) {
        window.clearTimeout(reachSplashTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setSelectedDiscardId(null);
  }, [state.phase, state.currentPlayerIndex]);

  useEffect(() => {
    setAnimationPhase("idle");
    setAnimationCard(null);
    setDiscardingCardId(null);
    timeoutsRef.current.forEach(window.clearTimeout);
    timeoutsRef.current = [];
  }, [state.currentPlayerIndex]);

  useEffect(() => {
    if (selectedDiscardId && !currentPlayer.hand.some((card) => card.id === selectedDiscardId)) {
      setSelectedDiscardId(null);
    }
  }, [currentPlayer.hand, selectedDiscardId]);

  useEffect(() => {
    if (state.phase === "handoff") {
      const timeoutId = window.setTimeout(() => {
        dispatch({ type: "confirmHandoff" });
      }, 3000);

      return () => {
        window.clearTimeout(timeoutId);
      };
    }
  }, [state.phase, dispatch]);

  useEffect(() => {
    if (state.phase === "ronCheck") {
      setRonCountdown(3);
      const intervalId = window.setInterval(() => {
        setRonCountdown((count) => Math.max(0, count - 1));
      }, 1000);

      return () => {
        window.clearInterval(intervalId);
      };
    }
  }, [state.phase, dispatch]);

  useLayoutEffect(() => {
    if (playerCount < 3) {
      setMeasuredHistoryPositions({});
      return;
    }

    let frameId = 0;

    const measureHistoryAnchors = () => {
      const scene = sceneRef.current;
      if (!scene) return;

      const sceneRect = scene.getBoundingClientRect();
      const next: Record<number, { left: string; top: string }> = {};
      const debugRows: Array<Record<string, unknown>> = [];

      for (let index = 0; index < state.players.length; index += 1) {
        const element = historyMeasureRefs.current.get(index);
        if (!element) continue;

        const rect = element.getBoundingClientRect();
        let left = rect.left + rect.width / 2 - sceneRect.left;
        let top = rect.top + rect.height / 2 - sceneRect.top;

        if (playerCount === 5 && index === 4) {
          const player4 = next[3];
          if (player4) {
            const player4Left = Number.parseFloat(player4.left);
            const player4Top = Number.parseFloat(player4.top);
            if (Math.hypot(left - player4Left, top - player4Top) < 58) {
              left -= 42;
              top -= 18;
            }
          }
        }

        left = Math.max(24, Math.min(sceneRect.width - 24, left));
        top = Math.max(24, Math.min(sceneRect.height - 24, top));
        next[index] = {
          left: `${Math.round(left)}px`,
          top: `${Math.round(top)}px`,
        };

        debugRows.push({
          playerId: state.players[index]?.id,
          playerName: state.players[index]?.name,
          rectLeft: Math.round(rect.left),
          rectTop: Math.round(rect.top),
          rectWidth: Math.round(rect.width),
          rectHeight: Math.round(rect.height),
          finalLeft: next[index].left,
          finalTop: next[index].top,
        });
      }

      setMeasuredHistoryPositions((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));

      if (window.localStorage.getItem("debugHistoryAnchors") === "1") {
        console.table(debugRows);
      }
    };

    const scheduleMeasure = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(measureHistoryAnchors);
    };

    scheduleMeasure();
    window.addEventListener("resize", scheduleMeasure);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", scheduleMeasure);
    };
  }, [playerCount, state.players]);

  function schedule(callback: () => void, delay: number) {
    const timeoutId = window.setTimeout(callback, delay);
    timeoutsRef.current.push(timeoutId);
  }

  function finishAnimation() {
    setAnimationPhase("idle");
    setAnimationCard(null);
    setDiscardingCardId(null);
  }

  function handleDrawFromDeck() {
    if (isAnimating || state.deck.length === 0) return;
    const card = state.deck[0];
    setAnimationCard(card);
    setAnimationPhase("drawingFromDeck");
    schedule(() => setAnimationPhase("revealingDrawnCard"), 280);
    schedule(() => setAnimationPhase("movingDrawnCardToHand"), 1550);
    schedule(() => {
      dispatch({ type: "drawFromDeck" });
      finishAnimation();
    }, 2100);
  }

  function animateDiscard(card: Card, afterAnimation: () => void) {
    if (isAnimating) return;
    setAnimationCard(card);
    setDiscardingCardId(card.id);
    setAnimationPhase("discardingCard");
    schedule(() => {
      afterAnimation();
      setSelectedDiscardId(null);
      finishAnimation();
    }, 650);
  }

  function handleDiscardSelected() {
    const card = currentPlayer.hand.find((item) => item.id === selectedDiscardId);
    if (!card) return;
    animateDiscard(card, () => dispatch({ type: "discard", cardId: card.id }));
  }

  function handleDiscardDrawnOnly() {
    if (!state.drawnCard) return;
    animateDiscard(state.drawnCard, () => dispatch({ type: "discardDrawnOnly" }));
  }

  function handleWinWithDiscard(card: Card) {
    animateDiscard(card, () => dispatch({ type: "winWithDiscard", discardCardId: card.id }));
  }

  function showReachSplash(playerName: string) {
    setReachSplashPlayerName(playerName);
    if (reachSplashTimeoutRef.current !== null) {
      window.clearTimeout(reachSplashTimeoutRef.current);
    }
    reachSplashTimeoutRef.current = window.setTimeout(() => {
      setReachSplashPlayerName(null);
      reachSplashTimeoutRef.current = null;
    }, 2600);
  }

  function handleDeclareReach() {
    dispatch({ type: "declareReach" });
    showReachSplash(currentPlayer.name);
  }

  function handleReachConfirmAnswer(declareReach: boolean) {
    dispatch({ type: "answerReachAfterDiscard", declareReach });
    if (declareReach) {
      showReachSplash(currentPlayer.name);
    }
  }

  return (
    <main className="screen play-screen">
      <section className={`table-scene table-${playerCount}`} aria-label={`${playerCount}人用テーブル`} ref={sceneRef}>
        {currentRound && <div className="round-scroll-banner">- {currentRound}回戦 -</div>}
        <header
          className={`top-toolbar ${animationPhase === "discardingCard" ? "toolbar-exiting" : ""}`}
          key={`toolbar-${state.currentPlayerIndex}`}
        >
          <div className="toolbar-player">
            <span>現在のプレイヤー</span>
            <strong>{currentPlayer.name}</strong>
            <em>{getPlayerStatus(currentPlayer)}</em>
          </div>
          <div className="toolbar-action">{getActionText(state)}</div>
          <div className="toolbar-deck">
            <span>山札</span>
            <strong>{state.deck.length}</strong>
          </div>
        </header>

        <div className="table-shape">
          <div className={`deck-stack ${state.deck.length === 0 ? "empty-deck" : ""}`} aria-label={`山札 ${state.deck.length}枚`}>
            <span className="deck-layer layer-one" />
            <span className="deck-layer layer-two" />
            <PlayingCard isBack compact />
            <strong>{state.deck.length}</strong>
          </div>
        </div>

        {animationCard && animationPhase !== "discardingCard" && (
          <div className={`card-animation ${animationPhase} seat-${getSeat(playerCount, state.currentPlayerIndex)}`}>
            <span className="card-animation-label">{getAnimationLabel(animationPhase)}</span>
            <PlayingCard card={animationCard} />
          </div>
        )}

        {reachSplashPlayerName && (
          <div className="reach-splash" role="status" aria-live="assertive">
            <div className="reach-splash-band">
              <img src={reachVisualSrc} alt="" className="reach-splash-visual" />
              <div className="reach-splash-copy">
                <span>宣言</span>
                <strong>{reachSplashPlayerName} リーチ!!</strong>
              </div>
            </div>
          </div>
        )}

        {state.phase === "ronCheck" && pendingRonResult && (
          <div className="ron-check-overlay" role="status" aria-live="assertive">
            <section className="ron-check-panel">
              <p className="eyebrow">ロン確認</p>
              <h1>{ronWinners.map((item) => state.players[item.winnerIndex].name).join("・")} ロン!!</h1>
              <div className="ron-check-card">
                <span>{ronDiscarder ? `${ronDiscarder.name}の捨て札` : "捨て札"}</span>
                <strong>{ronCard ? formatCard(ronCard) : "確認中"}</strong>
              </div>
              <div className="ron-check-winners">
                {(
                  ronWinners.length > 0
                    ? ronWinners
                    : [
                        {
                          winnerIndex: pendingRonResult.winnerIndex,
                          winningResult: pendingRonResult.winningResult,
                          score: pendingRonResult.score,
                        },
                      ]
                ).map((item) => (
                    <section className="ron-check-candidate" key={item.winnerIndex}>
                      <div className="ron-check-row">
                        <span>{state.players[item.winnerIndex].name}</span>
                        <strong>ロン可能</strong>
                      </div>
                      <div className="ron-hand-preview" aria-label={`${state.players[item.winnerIndex].name}の手札完成プレビュー`}>
                        {item.winningResult.melds.map((meld, meldIndex) => (
                          <div className="ron-preview-meld" key={`${item.winnerIndex}-${meldIndex}-${meld.map((card) => card.id).join("-")}`}>
                            {meld.map((card) => (
                              <PlayingCard card={card} compact key={card.id} />
                            ))}
                          </div>
                        ))}
                      </div>
                      <div className="ron-rest-preview" aria-label={`${state.players[item.winnerIndex].name}の余ったトランプ`}>
                        <span>余ったトランプ</span>
                        <div>
                          {getRonRemainingCards(state.players[item.winnerIndex].hand, ronCard, item.winningResult.melds).length === 0 ? (
                            <em>なし</em>
                          ) : (
                            getRonRemainingCards(state.players[item.winnerIndex].hand, ronCard, item.winningResult.melds).map((card) => (
                              <PlayingCard card={card} compact key={card.id} />
                            ))
                          )}
                        </div>
                      </div>
                    </section>
                  ))}
              </div>
              <div className="countdown-ring" aria-label={`ロン確認 ${ronCountdown}秒`}>
                {ronCountdown}
              </div>
              <div className="ron-check-actions">
                <button type="button" className="primary-button" onClick={() => dispatch({ type: "answerRon", takeRon: true })}>
                  はい
                </button>
                <button type="button" onClick={() => dispatch({ type: "answerRon", takeRon: false })}>
                  いいえ
                </button>
              </div>
            </section>
          </div>
        )}

        {state.players.map((player, index) => (
          <PlayerArea
            key={player.id}
            player={player}
            isCurrent={index === state.currentPlayerIndex}
            seat={getSeat(playerCount, index)}
            style={getSeatStyle(playerCount, index)}
          />
        ))}

        {playerCount >= 4 &&
          state.players.map((player, index) => {
            const layout = measuredAnchorLayouts[playerCount]?.[index];
            if (!layout) return null;

            return (
              <span
                className={`history-measure-anchor history-measure-anchor--p${index + 1}`}
                style={layout}
                ref={(node) => {
                  if (node) {
                    historyMeasureRefs.current.set(index, node);
                  } else {
                    historyMeasureRefs.current.delete(index);
                  }
                }}
                aria-hidden="true"
                key={`${player.id}-history-measure`}
              />
            );
          })}

        {playerCount >= 4 &&
          state.players.map((player, index) => (
            <div
              className={`history-hover-anchor history-hover-anchor--${getSeat(playerCount, index)} history-hover-anchor--p${index + 1}`}
              style={measuredHistoryPositions[index] ?? getHistoryAnchorStyle(playerCount, index)}
              key={`${player.id}-history-hover`}
            >
              <button type="button" className="history-hover-marker" aria-label={`${player.name}の履歴を確認`}>
                ?
              </button>
              <PlayerHistoryPopover player={player} showMelds />
            </div>
          ))}

        {showTableCardLayer &&
          state.players.map((player, index) =>
            player.discardPile.length > 0 ? (
              <div
                className={`history-hover-anchor table-history-anchor table-history-anchor--${getAreaName(getSeat(playerCount, index))}`}
                style={measuredHistoryPositions[index] ?? getHistoryAnchorStyle(playerCount, index)}
                key={`${player.id}-table-history-hover`}
              >
                <button type="button" className="history-hover-marker" aria-label={`${player.name}の捨て札履歴を確認`}>
                  ?
                </button>
                <PlayerHistoryPopover player={player} showMelds={false} />
              </div>
            ) : null,
          )}

        {showTableCardLayer && (
          <div className="table-card-layer" aria-label="捨て札と公開役">
            {state.players.map((player, index) => {
              const area = getAreaName(getSeat(playerCount, index));
              if (area === "self") {
                return (
                  <div className="self-table-zone" key={`${player.id}-field`}>
                    <div className="self-discard-column">
                      <DiscardPile cards={player.discardPile} area={area} highlightLatest={discardHighlights.get(index) ?? null} />
                      {player.discardPile.length > 0 && (
                        <span
                          className="discard-first-card-anchor"
                          ref={(node) => {
                            if (node) {
                              historyMeasureRefs.current.set(index, node);
                            } else {
                              historyMeasureRefs.current.delete(index);
                            }
                          }}
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    <div className="self-open-melds-zone">
                      <MeldArea melds={player.openMelds} area={area} />
                    </div>
                  </div>
                );
              }

              if (area === "left" || area === "right") {
                return (
                  <div className={`opponent-field opponent-field--${area}`} key={`${player.id}-field`}>
                    <div className="opponent-card-group">
                      <div className={`opponent-discard-stack history-hover-zone--${area}`}>
                        <DiscardPile cards={player.discardPile} area={area} highlightLatest={discardHighlights.get(index) ?? null} />
                        {player.discardPile.length > 0 && (
                          <span
                            className="discard-first-card-anchor"
                            ref={(node) => {
                              if (node) {
                                historyMeasureRefs.current.set(index, node);
                              } else {
                                historyMeasureRefs.current.delete(index);
                              }
                            }}
                            aria-hidden="true"
                          />
                        )}
                      </div>
                      <div className="opponent-meld-zone">
                        <MeldArea melds={player.openMelds} area={area} />
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div className={`card-field card-field--${area}`} key={`${player.id}-field`}>
                  <div className={`history-hover-zone--${area}`}>
                    <DiscardPile cards={player.discardPile} area={area} highlightLatest={discardHighlights.get(index) ?? null} />
                    {player.discardPile.length > 0 && (
                      <span
                        className="discard-first-card-anchor"
                        ref={(node) => {
                          if (node) {
                            historyMeasureRefs.current.set(index, node);
                          } else {
                            historyMeasureRefs.current.delete(index);
                          }
                        }}
                        aria-hidden="true"
                      />
                    )}
                  </div>
                  <div className={`open-meld-field open-meld-field--${area}`}>
                    <MeldArea melds={player.openMelds} area={area} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <section className="action-panel">
          {state.phase === "draw" && (
            <>
              <button
                type="button"
                className="primary-button"
                disabled={state.deck.length === 0 || isAnimating}
                onClick={handleDrawFromDeck}
              >
                山札から引く
              </button>
              {discardSources.map((ownerIndex) => {
                const callOptions = getCallOptionsForSource(state, ownerIndex);
                const sourceDiscard = state.players[ownerIndex].discardPile.at(-1) ?? null;
                return (
                  <div className="discard-source" key={ownerIndex}>
                    <strong>{state.players[ownerIndex].name}の捨て札</strong>
                    {callOptions.map((meld, optionIndex) => (
                      <button
                        type="button"
                        key={meld.map((card) => card.id).join("-")}
                        disabled={isAnimating}
                        onClick={() => dispatch({ type: "takeDiscard", ownerIndex, meld })}
                      >
                        {sourceDiscard && isWinningCall(currentPlayer.hand, currentPlayer.openMelds, meld, sourceDiscard) ? "ロン" : "鳴く"}{" "}
                        {optionIndex + 1}: {meld.map(formatCard).join(" ")}
                      </button>
                    ))}
                  </div>
                );
              })}
            </>
          )}

          {state.phase === "discard" && (
            <>
              {canReachAfterDraw && (
                <button type="button" className="primary-button" disabled={isAnimating} onClick={handleDeclareReach}>
                  リーチ
                </button>
              )}
              {currentPlayer.isReach && !state.declaredReachThisTurn && reachOptions.length === 0 && (
                <button type="button" className="primary-button" disabled={isAnimating} onClick={handleDiscardDrawnOnly}>
                  引いたカードをそのまま捨てる
                </button>
              )}
              {currentPlayer.isReach && !state.declaredReachThisTurn && reachOptions.length > 0 && (
                <div className="reach-win-options">
                  <strong>上がるために捨てるカード</strong>
                  {reachOptions.map((option) => (
                    <button
                      type="button"
                      className="primary-button"
                      key={option.discardCard.id}
                      disabled={isAnimating}
                      onClick={() => handleWinWithDiscard(option.discardCard)}
                    >
                      上がる: {formatCard(option.discardCard)}を捨てる
                    </button>
                  ))}
                </div>
              )}
              {canChooseDiscard && (
                <>
                  <p className="hint">手札のカードを選んでから捨てます。</p>
                  <button type="button" className="primary-button" disabled={!selectedDiscardId || isAnimating} onClick={handleDiscardSelected}>
                    捨てる
                  </button>
                </>
              )}
            </>
          )}

          {state.phase === "reachConfirm" && (
            <div className="reach-win-options">
              <strong>リーチを宣言しますか？</strong>
              <button
                type="button"
                className="primary-button"
                disabled={isAnimating}
                onClick={() => handleReachConfirmAnswer(true)}
              >
                はい
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={isAnimating}
                onClick={() => handleReachConfirmAnswer(false)}
              >
                いいえ
              </button>
            </div>
          )}

        </section>

        <section className="hand-section">
          <HandView
            key={currentPlayer.id}
            cards={currentPlayer.hand}
            drawnCardId={state.drawnCard?.id ?? null}
            selectedCardId={selectedDiscardId}
            discardingCardId={discardingCardId}
            disabled={state.phase !== "discard" || !canChooseDiscard || isAnimating}
            onCardClick={(card) => setSelectedDiscardId((previousId) => (previousId === card.id ? null : card.id))}
          />
        </section>
      </section>
    </main>
  );
}

interface PlayerHistoryPopoverProps {
  player: GameState["players"][number];
  showMelds: boolean;
}

function PlayerHistoryPopover({ player, showMelds }: PlayerHistoryPopoverProps) {
  return (
    <section className={`player-history-popover ${showMelds ? "with-melds" : "discard-only"}`} role="tooltip">
      <div className="history-column">
        <h3>過去の捨て札</h3>
        {player.discardPile.length === 0 ? (
          <p className="history-empty">まだ捨てていません</p>
        ) : (
          <div className="history-card-grid" aria-label={`${player.name}の過去の捨て札`}>
            {player.discardPile.map((card) => (
              <PlayingCard card={card} compact key={card.id} />
            ))}
          </div>
        )}
      </div>

      {showMelds && (
        <div className="history-column history-meld-column">
          <h3>鳴いた役</h3>
          {player.openMelds.length === 0 ? (
            <p className="history-empty">まだ鳴いていません</p>
          ) : (
            <div className="history-meld-list" aria-label={`${player.name}の鳴いた役`}>
              {player.openMelds.map((meld, index) => (
                <div className="history-meld-row" key={`${player.id}-meld-${index}-${meld.map((card) => card.id).join("-")}`}>
                  {meld.map((card) => (
                    <PlayingCard card={card} compact key={card.id} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function getSeat(playerCount: number, index: number): "top" | "right" | "bottom" | "left" {
  const seats: Record<number, Array<"top" | "right" | "bottom" | "left">> = {
    3: ["bottom", "right", "left"],
    4: ["top", "right", "bottom", "left"],
    5: ["top", "right", "right", "bottom", "left"],
  };
  return seats[playerCount]?.[index] ?? "bottom";
}

function getAreaName(seat: "top" | "right" | "bottom" | "left"): "self" | "left" | "right" | "top" {
  return seat === "bottom" ? "self" : seat;
}

function getSeatStyle(playerCount: number, index: number): CSSProperties {
  const positions = seatPositions[playerCount] ?? seatPositions[4];
  const position = positions[index] ?? positions[0];
  return {
    left: position.left,
    top: position.top,
  };
}

function getHistoryAnchorStyle(playerCount: number, index: number): CSSProperties {
  const exact = historyAnchorPositions[playerCount]?.[index];
  if (exact) return exact;
  return getSeatStyle(playerCount, index);
}

function getPlayerStatus(player: GameState["players"][number]) {
  if (player.isReach) return "リーチ中";
  if (player.hasCalled) return "鳴き済み";
  return "通常";
}

function getDiscardHighlights(state: GameState, discardSources: number[]) {
  const highlights = new Map<number, "call" | "ron">();
  const ronDiscarderIndex = state.pendingRonResult?.discarderIndex ?? null;
  if (state.phase === "ronCheck" && ronDiscarderIndex !== null) {
    highlights.set(ronDiscarderIndex, "ron");
    return highlights;
  }
  if (state.phase !== "draw") return highlights;

  for (const ownerIndex of discardSources) {
    highlights.set(ownerIndex, "call");
  }

  return highlights;
}

function isWinningCall(hand: Card[], openMelds: Card[][], meld: Card[], discard: Card) {
  const usedHandIds = new Set(meld.filter((card) => card.id !== discard.id).map((card) => card.id));
  const handAfterCall = hand.filter((card) => !usedHandIds.has(card.id));
  return checkWinningHandWithOpenMelds(handAfterCall, [...openMelds, meld]).canWin;
}

function getRonRemainingCards(hand: Card[], ronCard: Card | null, melds: Card[][]) {
  const cards = ronCard ? [...hand, ronCard] : hand;
  const usedCounts = new Map<string, number>();

  for (const card of melds.flat()) {
    usedCounts.set(card.id, (usedCounts.get(card.id) ?? 0) + 1);
  }

  return cards.filter((card) => {
    const count = usedCounts.get(card.id) ?? 0;
    if (count <= 0) return true;
    usedCounts.set(card.id, count - 1);
    return false;
  });
}

function getActionText(state: GameState) {
  if (state.phase === "draw") return "山札または直前の捨て札から1枚取ってください。";
  if (state.phase === "discard") return "手札から1枚選んで捨ててください。";
  if (state.phase === "reachConfirm") return "リーチ宣言を確認してください。";
  if (state.phase === "ronCheck") return "ロン可能な捨て札を確認しています。";
  if (state.phase === "handoff") return "次のプレイヤーへ交代してください。";
  if (state.drawnCard) return `引いたカード: ${formatCard(state.drawnCard)}`;
  return state.message;
}

function getAnimationLabel(phase: AnimationPhase) {
  if (phase === "drawingFromDeck") return "山札からドロー";
  if (phase === "revealingDrawnCard") return "引いたカード";
  if (phase === "movingDrawnCardToHand") return "手札へ";
  if (phase === "discardingCard") return "捨て札へ";
  return "";
}
