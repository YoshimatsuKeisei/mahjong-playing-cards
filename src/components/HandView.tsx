import type { CSSProperties } from "react";
import { findPossibleMelds } from "../game/rules";
import type { Card } from "../types";
import PlayingCard, { formatCard, formatRank, formatSuit } from "./PlayingCard";

interface HandViewProps {
  cards: Card[];
  drawnCardId?: string | null;
  selectedCardId?: string | null;
  discardingCardId?: string | null;
  selectableCardIds?: string[] | null;
  disabledCardIds?: string[] | null;
  disabled?: boolean;
  onCardClick?: (card: Card) => void;
}

export default function HandView({
  cards,
  drawnCardId,
  selectedCardId,
  discardingCardId,
  selectableCardIds,
  disabledCardIds,
  disabled = false,
  onCardClick,
}: HandViewProps) {
  const sortedCards = sortCardsForHand(getUniqueCardsById(cards));
  const meldCardIds = getMeldCardIds(sortedCards);
  const selectableSet = selectableCardIds ? new Set(selectableCardIds) : null;
  const disabledSet = disabledCardIds ? new Set(disabledCardIds) : null;
  const center = (sortedCards.length - 1) / 2;

  return (
    <div className="hand-view">
      {sortedCards.map((card, index) => (
        <button
          type="button"
          className={[
            "card-button",
            "hand-card",
            meldCardIds.has(card.id) ? "meld-highlight-card" : "",
            selectedCardId === card.id ? "selected-card" : "",
            discardingCardId === card.id ? "discarding-card" : "",
            selectableSet && !selectableSet.has(card.id) ? "unselectable-card" : "",
            disabledSet && disabledSet.has(card.id) ? "shielded-card" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          key={card.id}
          disabled={disabled || (selectableSet !== null && !selectableSet.has(card.id)) || (disabledSet !== null && disabledSet.has(card.id))}
          style={getHandCardStyle(index, center)}
          aria-label={`discard ${formatSuit(card.suit)}${formatRank(card.rank)}`}
          onClick={() => onCardClick?.(card)}
        >
          <PlayingCard card={card} isDrawn={drawnCardId === card.id} />
        </button>
      ))}
    </div>
  );
}

function getUniqueCardsById(cards: Card[]) {
  const seen = new Set<string>();
  return cards.filter((card) => {
    if (seen.has(card.id)) return false;
    seen.add(card.id);
    return true;
  });
}

function sortCardsForHand(cards: Card[]) {
  const suitOrder: Card["suit"][] = ["S", "H", "D", "C"];
  return [...cards].sort((a, b) => {
    return a.rank - b.rank || suitOrder.indexOf(a.suit) - suitOrder.indexOf(b.suit) || a.id.localeCompare(b.id);
  });
}

function getMeldCardIds(cards: Card[]) {
  return new Set(findPossibleMelds(cards).flatMap((meld) => meld.map((card) => card.id)));
}

function getHandCardStyle(index: number, center: number): CSSProperties {
  const offset = index - center;
  return {
    "--hand-rotate": `${offset * 4.2}deg`,
    "--hand-rise": `${Math.abs(offset) * 2.8}px`,
    zIndex: index + 1,
  } as CSSProperties & Record<string, string | number>;
}

export { formatCard, formatRank, formatSuit };
