import type { Card } from "../types";

interface PlayingCardProps {
  card?: Card | null;
  isDrawn?: boolean;
  isBack?: boolean;
  compact?: boolean;
}

export default function PlayingCard({ card, isDrawn = false, isBack = false, compact = false }: PlayingCardProps) {
  if (isBack || !card) {
    return (
      <span className={`playing-card card-back ${compact ? "compact" : ""}`} aria-label="裏向きのカード">
        <span className="card-back-pattern" />
      </span>
    );
  }

  const red = card.suit === "H" || card.suit === "D";
  const rank = formatRank(card.rank);
  const suit = formatSuit(card.suit);

  return (
    <span className={`playing-card ${red ? "red" : "black"} ${isDrawn ? "drawn" : ""} ${compact ? "compact" : ""}`}>
      <span className="card-corner top-corner">
        <strong>{rank}</strong>
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
