import { useState } from "react";
import type { Direction } from "../types";

interface StartScreenProps {
  onStart: (playerCount: number, direction: Direction) => void;
  onBackHome: () => void;
}

export default function StartScreen({ onStart, onBackHome }: StartScreenProps) {
  const [playerCount, setPlayerCount] = useState(4);
  const [direction, setDirection] = useState<Direction>("clockwise");

  return (
    <main className="screen start-screen">
      <section className="start-panel">
        <p className="eyebrow">Local hot-seat card game</p>
        <h1>トランプ雀</h1>
        <div className="field">
          <span>プレイヤー人数</span>
          <div className="segmented">
            {[3, 4, 5].map((count) => (
              <button
                key={count}
                type="button"
                className={playerCount === count ? "selected" : ""}
                onClick={() => setPlayerCount(count)}
              >
                {count}人
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>回転方向</span>
          <div className="segmented">
            <button
              type="button"
              className={direction === "clockwise" ? "selected" : ""}
              onClick={() => setDirection("clockwise")}
            >
              時計回り
            </button>
            <button
              type="button"
              className={direction === "counterclockwise" ? "selected" : ""}
              onClick={() => setDirection("counterclockwise")}
            >
              反時計回り
            </button>
          </div>
        </div>
        <button type="button" className="primary-button" onClick={() => onStart(playerCount, direction)}>
          ゲーム開始
        </button>
        <button type="button" className="secondary-button" onClick={onBackHome}>
          Home
        </button>
      </section>
    </main>
  );
}
