import type { CSSProperties } from "react";
import type { Card } from "../types";
import PlayingCard from "./PlayingCard";

interface MeldAreaProps {
  melds: Card[][];
  area?: "self" | "left" | "right" | "top";
}

type Vec2 = { x: number; y: number };

type SideLayoutConfig = {
  meldAnchor: Vec2;
  meldStep: Vec2;
};

const sideLayout: Record<"left" | "right", SideLayoutConfig> = {
  left: {
    meldAnchor: { x: 0, y: 0 },
    meldStep: { x: 30, y: 18 },
  },
  right: {
    meldAnchor: { x: 0, y: 0 },
    meldStep: { x: -30, y: 18 },
  },
};

export default function MeldArea({ melds, area = "self" }: MeldAreaProps) {
  return (
    <div className="meld-area">
      {melds.length > 0 && (
        <div className="meld-sets">
          {melds.map((meld, index) => (
            <div
              className="meld meld-row"
              key={`${index}-${meld.map((card) => card.id).join("-")}`}
              style={getMeldStyle(area, index)}
            >
              {meld.map((card) => (
                <PlayingCard card={card} compact key={card.id} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function getMeldStyle(area: NonNullable<MeldAreaProps["area"]>, index: number) {
  if (area === "left" || area === "right") {
    const position = getMeldLayout(area, index);

    return {
      "--meld-index": index,
      "--meld-offset-x": `${position.x}px`,
      "--meld-offset-y": `${position.y}px`,
    } as CSSProperties & Record<string, string | number>;
  }

  return { "--meld-index": index } as CSSProperties & Record<string, number>;
}

function getMeldLayout(area: "left" | "right", meldIndex: number): Vec2 {
  const config = sideLayout[area];
  return {
    x: config.meldAnchor.x + config.meldStep.x * meldIndex,
    y: config.meldAnchor.y + config.meldStep.y * meldIndex,
  };
}
