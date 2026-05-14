import type { CSSProperties } from "react";
import type { Card } from "../types";
import PlayingCard from "./PlayingCard";

interface DiscardPileProps {
  cards: Card[];
  area: "self" | "left" | "right" | "top";
  highlightLatest?: "call" | "ron" | null;
}

type Vec2 = { x: number; y: number };

type SideLayoutConfig = {
  discardAnchor: Vec2;
  discardStep: Vec2;
};

const sideLayout: Record<"left" | "right", SideLayoutConfig> = {
  left: {
    discardAnchor: { x: 0, y: 0 },
    discardStep: { x: 6, y: 5 },
  },
  right: {
    discardAnchor: { x: 0, y: 0 },
    discardStep: { x: -6, y: 5 },
  },
};

export default function DiscardPile({ cards, area, highlightLatest = null }: DiscardPileProps) {
  const visibleCards = cards.slice(-5);

  return (
    <div className={`pile discard-area discard-area--${area}`}>
      <div className="discard-stack" style={getStackStyle(visibleCards.length, area)}>
        {visibleCards.length > 0 &&
          visibleCards.map((card, index) => (
            <span
              className={[
                "discard-card",
                `discard-card--${area}`,
                index === visibleCards.length - 1 ? "latest" : "",
                index === visibleCards.length - 1 && highlightLatest === "call" ? "callable-discard" : "",
                index === visibleCards.length - 1 && highlightLatest === "ron" ? "ron-discard" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              key={card.id}
              style={getCardStyle(area, index, visibleCards.length)}
            >
              <PlayingCard card={card} compact />
            </span>
          ))}
      </div>
    </div>
  );
}

function getCardStyle(area: DiscardPileProps["area"], index: number, cardCount: number) {
  const newestLift = index === cardCount - 1 ? -2 : 0;
  if (area === "self") {
    return {
      top: `${index * 8 + newestLift}px`,
      left: "0px",
      "--discard-rotate": "0deg",
      zIndex: index + 1,
    } as CSSProperties & Record<string, string | number>;
  }

  if (area === "left") {
    const position = getDiscardLayout("left", index);
    return {
      top: `${position.y}px`,
      left: `${position.x}px`,
      "--discard-rotate": `${(index % 2 === 0 ? -1 : 1) * 0.7}deg`,
      zIndex: index + 1,
    } as CSSProperties & Record<string, string | number>;
  }

  if (area === "right") {
    const position = getDiscardLayout("right", index);
    return {
      top: `${position.y}px`,
      left: `${position.x}px`,
      "--discard-rotate": `${(index % 2 === 0 ? 1 : -1) * 0.7}deg`,
      zIndex: index + 1,
    } as CSSProperties & Record<string, string | number>;
  }

  return {
    top: `${index * 10}px`,
    left: `${index * 3}px`,
    "--discard-rotate": "0deg",
    zIndex: index + 1,
  } as CSSProperties & Record<string, string | number>;
}

function getDiscardLayout(area: "left" | "right", discardIndex: number): Vec2 {
  const config = sideLayout[area];
  return {
    x: config.discardAnchor.x + config.discardStep.x * discardIndex,
    y: config.discardAnchor.y + config.discardStep.y * discardIndex,
  };
}

function getStackStyle(cardCount: number, area: DiscardPileProps["area"]) {
  if (area === "self") {
    return {
      width: cardCount === 0 ? "0px" : "72px",
      height: cardCount === 0 ? "0px" : `${78 + Math.max(0, cardCount - 1) * 8}px`,
    };
  }

  return {
    width: cardCount === 0 ? "0px" : `${82 + Math.max(0, cardCount - 1) * 8}px`,
    height: cardCount === 0 ? "0px" : `${62 + Math.max(0, cardCount - 1) * 16}px`,
  };
}
