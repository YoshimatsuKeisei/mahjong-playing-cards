import { cardBackImageSrc, getCardFaceImageSrc } from "../cardImages";
import type { Card } from "../types";

interface PlayingCardProps {
  card?: Card | null;
  isDrawn?: boolean;
  isBack?: boolean;
  compact?: boolean;
  testId?: string;
}

export default function PlayingCard({
  card,
  isDrawn = false,
  isBack = false,
  compact = false,
  testId,
}: PlayingCardProps) {
  if (isBack || !card) {
    if (cardBackImageSrc) {
      return (
        <span
          className={`playing-card card-back image-card ${compact ? "compact" : ""}`}
          aria-label="裏向きのカード"
        >
          <img
            className="playing-card-image"
            src={cardBackImageSrc}
            alt=""
            aria-hidden="true"
            draggable={false}
          />
        </span>
      );
    }

    return (
      <span className={`playing-card card-back ${compact ? "compact" : ""}`} aria-label="裏向きのカード">
        <span className="card-back-pattern" />
      </span>
    );
  }

  const red = card.suit === "H" || card.suit === "D";
  const rank = formatRank(card.rank);
  const suit = formatSuit(card.suit);
  const cardLabel = formatCard(card);
  const cardImageSrc = getCardFaceImageSrc(card);

  if (cardImageSrc) {
    return (
      <span
        className={`playing-card image-card ${red ? "red" : "black"} ${isDrawn ? "drawn" : ""} ${compact ? "compact" : ""}`}
        data-testid={testId}
        data-card-id={card.id}
        data-card-rank={rank}
        data-card-suit={card.suit}
        data-card-label={cardLabel}
        aria-label={cardLabel}
      >
        <img
          className="playing-card-image"
          src={cardImageSrc}
          alt=""
          aria-hidden="true"
          draggable={false}
        />
      </span>
    );
  }

  return (
    <span
      className={`playing-card ${red ? "red" : "black"} ${isDrawn ? "drawn" : ""} ${compact ? "compact" : ""}`}
      data-testid={testId}
      data-card-id={card.id}
      data-card-rank={rank}
      data-card-suit={card.suit}
      data-card-label={cardLabel}
    >
      <span className="card-corner top-corner">
        <strong data-testid={testId ? `${testId}-rank` : undefined}>{rank}</strong>
        <span>{suit}</span>
      </span>
      <span className="card-face-center" aria-hidden="true">
        <strong>{rank}</strong>
        <span>{suit}</span>
      </span>
      <span className="card-corner bottom-corner">
        <strong>{rank}</strong>
        <span>{suit}</span>
      </span>
    </span>
  );
}

export function formatSuit(suit: Card["suit"]) {
  return suit === "S" ? "♠" : suit === "H" ? "♥" : suit === "D" ? "♦" : "♣";
}

export function formatRank(rank: number) {
  if (rank === 1) return "A";
  if (rank === 11) return "J";
  if (rank === 12) return "Q";
  if (rank === 13) return "K";
  return String(rank);
}

export function formatCard(card: Card) {
  return `${formatSuit(card.suit)}${formatRank(card.rank)}`;
}
