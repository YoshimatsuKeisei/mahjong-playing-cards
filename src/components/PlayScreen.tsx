import { useEffect, useRef, useState, type CSSProperties, type Dispatch } from "react";
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
}

type AnimationPhase = "idle" | "drawingFromDeck" | "revealingDrawnCard" | "movingDrawnCardToHand" | "discardingCard";

const seatPositions: Record<number, Array<{ left: string; top: string }>> = {
  3: [
    { left: "50%", top: "82%" },
    { left: "76%", top: "34%" },
    { left: "24%", top: "34%" },
  ],
  4: [
    { left: "50%", top: "16%" },
    { left: "79%", top: "52%" },
    { left: "50%", top: "83%" },
    { left: "21%", top: "52%" },
  ],
  5: [
    { left: "50%", top: "15%" },
    { left: "78%", top: "40%" },
    { left: "70%", top: "80%" },
    { left: "30%", top: "80%" },
    { left: "22%", top: "40%" },
  ],
};

export default function PlayScreen({ state, dispatch }: PlayScreenProps) {
  const currentPlayer = state.players[state.currentPlayerIndex];
  const reachOptions = getReachWinningOptions(state);
  const discardSources = getAvailableDiscardSources(state);
  const discardHighlights = getDiscardHighlights(state, discardSources);
  const playerCount = state.players.length;
  const canReachAfterDraw =
    state.phase === "discard" &&
    state.drawnFrom === "deck" &&
    canDeclareReachAfterDraw(currentPlayer.hand, currentPlayer.hasCalled, currentPlayer.isReach);
  const canChooseDiscard = !currentPlayer.isReach || state.declaredReachThisTurn;
  const [animationPhase, setAnimationPhase] = useState<AnimationPhase>("idle");
  const [animationCard, setAnimationCard] = useState<Card | null>(null);
  const [selectedDiscardId, setSelectedDiscardId] = useState<string | null>(null);
  const [discardingCardId, setDiscardingCardId] = useState<string | null>(null);
  const timeoutsRef = useRef<number[]>([]);
  const isAnimating = animationPhase !== "idle";

  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(window.clearTimeout);
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
      dispatch({ type: "confirmHandoff" });
    }
  }, [state.phase, dispatch]);

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

  return (
    <main className="screen play-screen">
      <section className={`table-scene table-${playerCount}`} aria-label={`${playerCount}人用テーブル`}>
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

        {state.players.map((player, index) => (
          <PlayerArea
            key={player.id}
            player={player}
            isCurrent={index === state.currentPlayerIndex}
            seat={getSeat(playerCount, index)}
            style={getSeatStyle(playerCount, index)}
          />
        ))}

        <div className="table-card-layer" aria-label="捨て札と公開役">
          {state.players.map((player, index) => {
            const area = getAreaName(getSeat(playerCount, index));
            if (area === "self") {
              return (
                <div className="self-table-zone" key={`${player.id}-field`}>
                  <div className="self-discard-column">
                    <DiscardPile cards={player.discardPile} area={area} highlightLatest={discardHighlights.get(index) ?? null} />
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
                    <div className="opponent-discard-stack">
                      <DiscardPile cards={player.discardPile} area={area} highlightLatest={discardHighlights.get(index) ?? null} />
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
                <DiscardPile cards={player.discardPile} area={area} highlightLatest={discardHighlights.get(index) ?? null} />
                <div className={`open-meld-field open-meld-field--${area}`}>
                  <MeldArea melds={player.openMelds} area={area} />
                </div>
              </div>
            );
          })}
        </div>

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
                <button type="button" className="primary-button" disabled={isAnimating} onClick={() => dispatch({ type: "declareReach" })}>
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
                onClick={() => dispatch({ type: "answerReachAfterDiscard", declareReach: true })}
              >
                はい
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={isAnimating}
                onClick={() => dispatch({ type: "answerReachAfterDiscard", declareReach: false })}
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

function getPlayerStatus(player: GameState["players"][number]) {
  if (player.isReach) return "リーチ中";
  if (player.hasCalled) return "鳴き済み";
  return "通常";
}

function getDiscardHighlights(state: GameState, discardSources: number[]) {
  const highlights = new Map<number, "call" | "ron">();
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

function getActionText(state: GameState) {
  if (state.phase === "draw") return "山札または直前の捨て札から1枚取ってください。";
  if (state.phase === "discard") return "手札から1枚選んで捨ててください。";
  if (state.phase === "reachConfirm") return "リーチ宣言を確認してください。";
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
