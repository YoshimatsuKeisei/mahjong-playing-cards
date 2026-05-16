import { useEffect, useRef, useState } from "react";
import HomeMenu, { type HomeMenuTarget } from "./HomeMenu";

interface HomeScreenProps {
  entryMode: "initial" | "return";
  onNavigate: (target: HomeMenuTarget) => void;
  onDebugDoubleRon?: () => void;
}

export default function HomeScreen({ entryMode, onNavigate, onDebugDoubleRon }: HomeScreenProps) {
  const [exiting, setExiting] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  function handleSelect(target: HomeMenuTarget) {
    if (exiting) return;
    setExiting(true);
    timeoutRef.current = window.setTimeout(() => {
      onNavigate(target);
    }, 360);
  }

  return (
    <main className="screen home-screen">
      <section className="home-title">
        <p className="eyebrow">Mahjong Poker Card Game</p>
        <h1>麻雀ポーカー</h1>
      </section>
      <section className={`home-menu-shell ${entryMode === "return" ? "entering" : ""} ${exiting ? "exiting" : ""}`}>
        <HomeMenu disabled={exiting} onSelect={handleSelect} />
        {import.meta.env.DEV && onDebugDoubleRon && (
          <button type="button" className="debug-result-button" disabled={exiting} onClick={onDebugDoubleRon}>
            Debug W Ron Result
          </button>
        )}
      </section>
    </main>
  );
}
