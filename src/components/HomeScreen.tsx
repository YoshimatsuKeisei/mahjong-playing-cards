import { type CSSProperties, useEffect, useRef, useState } from "react";
import HomeMenu, { type HomeMenuTarget } from "./HomeMenu";
import HomeStageDecor from "./HomeStageDecor";

interface HomeScreenProps {
  avatarId?: string;
  entryMode: "initial" | "return";
  onNavigate: (target: HomeMenuTarget) => void;
  debugResultActions?: Array<{ label: string; onClick: () => void }>;
}

export default function HomeScreen({
  avatarId = "home-character-1",
  entryMode,
  onNavigate,
  debugResultActions = [],
}: HomeScreenProps) {
  const [exiting, setExiting] = useState(false);
  const [homeScale, setHomeScale] = useState(0.8);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const baseWidth = 1920;
    const baseHeight = 1080;

    const updateScale = () => {
      const viewportWidth = window.innerWidth || baseWidth;
      const viewportHeight = window.innerHeight || baseHeight;
      setHomeScale(
        Math.min(0.8, viewportWidth / baseWidth, viewportHeight / baseHeight),
      );
    };

    updateScale();
    window.addEventListener("resize", updateScale);
    window.addEventListener("orientationchange", updateScale);
    return () => {
      window.removeEventListener("resize", updateScale);
      window.removeEventListener("orientationchange", updateScale);
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
      <div
        className="home-stage"
        style={{ "--home-scale": homeScale } as CSSProperties}
      >
        <HomeStageDecor
          avatarId={avatarId}
          returning={entryMode === "return"}
        />
        <section
          className={`home-menu-shell ${entryMode === "return" ? "entering" : ""} ${exiting ? "exiting" : ""}`}
        >
          <HomeMenu disabled={exiting} onSelect={handleSelect} />
          {import.meta.env.DEV && debugResultActions.length > 0 && (
            <div className="debug-result-panel" aria-label="DEV確認メニュー">
              {debugResultActions.map((action) => (
                <button
                  type="button"
                  className="debug-result-button"
                  disabled={exiting}
                  onClick={action.onClick}
                  key={action.label}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
