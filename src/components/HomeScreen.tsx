import { useEffect, useRef, useState } from "react";
import HomeMenu, { type HomeMenuTarget } from "./HomeMenu";
import HomeStageDecor from "./HomeStageDecor";

interface HomeScreenProps {
  entryMode: "initial" | "return";
  onNavigate: (target: HomeMenuTarget) => void;
  debugResultActions?: Array<{ label: string; onClick: () => void }>;
}

export default function HomeScreen({
  entryMode,
  onNavigate,
  debugResultActions = [],
}: HomeScreenProps) {
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
      <HomeStageDecor returning={entryMode === "return"} />
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
    </main>
  );
}
