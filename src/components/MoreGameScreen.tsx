import type { ReactNode } from "react";
import type { ResumableGameSummary } from "../online/types";

interface MoreGameScreenProps {
  resumableGames: ResumableGameSummary[];
  error?: string | null;
  onResume: (game: ResumableGameSummary) => void;
  onRefresh: () => void;
  onBackHome: () => void;
}

export default function MoreGameScreen({
  resumableGames,
  error,
  onResume,
  onRefresh,
  onBackHome,
}: MoreGameScreenProps) {
  const visibleGames = dedupeResumableGamesByRoom(resumableGames);
  return (
    <main className="screen room-choice-screen">
      <section className="room-choice-panel room-list-panel">
        <p className="room-list-eyebrow">More Game</p>
        <h1>復帰できる試合</h1>
        <p className="room-list-title" aria-hidden="true">
          復帰用ルーム一覧
        </p>

        {visibleGames.length === 0 ? (
          <div className="empty-room-list">
            <strong>復帰できる試合はありません</strong>
            <span>一時離脱中のオンライン対戦がある場合、ここに表示されます。</span>
          </div>
        ) : (
          <div className="room-list public-room-list" data-testid="resumable-game-list">
            {visibleGames.map((game) => (
              <article className="room-list-card public-room-card" key={`${game.roomId}-${game.playerId}`}>
                <div className="public-room-grid">
                  <ResumeCell label="ルーム名" value={game.roomName} />
                  <ResumeCell label="プレイヤー" value={game.playerName} />
                  <ResumeCell label="人数" value={`${game.totalPlayers}人プレイ`} />
                  <ResumeCell label="現在の局" value={`${game.currentRound}局目`} />
                  <ResumeCell
                    label="状態"
                    value={
                      <>
                        <span className="public-room-rule-badge is-main">
                          一時離脱中
                        </span>
                        <span className="public-room-rule-badge">
                          {game.mode === "cpuSubstitute" ? "CPU代行中" : "試合停止中"}
                        </span>
                        <span className="public-room-rule-badge">
                          残り {formatRemainingTime(game.expiresAt)}
                        </span>
                      </>
                    }
                  />
                </div>
                <button
                  type="button"
                  className="join-room-button"
                  onClick={() => onResume(game)}
                >
                  復帰
                </button>
              </article>
            ))}
          </div>
        )}

        {error && <p className="online-error">{error}</p>}

        <div className="room-choice-actions">
          <button type="button" className="secondary-button" onClick={onRefresh}>
            更新
          </button>
          <button type="button" onClick={onBackHome}>
            ホーム画面に戻る
          </button>
        </div>
      </section>
    </main>
  );
}

function dedupeResumableGamesByRoom(games: ResumableGameSummary[]) {
  const uniqueGames = new Map<string, ResumableGameSummary>();
  for (const game of games) {
    const existing = uniqueGames.get(game.roomId);
    if (!existing || game.expiresAt > existing.expiresAt) {
      uniqueGames.set(game.roomId, game);
    }
  }
  return Array.from(uniqueGames.values());
}

function ResumeCell({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="public-room-cell">
      <span className="public-room-column-label">{label}</span>
      <span className="public-room-value">{value}</span>
    </div>
  );
}

function formatRemainingTime(expiresAt: number) {
  const remainingMs = Math.max(0, expiresAt - Date.now());
  const minutes = Math.floor(remainingMs / 60000);
  const seconds = Math.floor((remainingMs % 60000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
