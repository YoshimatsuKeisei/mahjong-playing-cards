import type { OnlinePublicRoom } from "../online/types";
import type { CpuModelId, DaifugoOptions, MatchMode } from "../types";
import type { ReactNode } from "react";

interface RoomListScreenProps {
  rooms?: OnlinePublicRoom[];
  error?: string | null;
  onJoinRoom: (roomId: string) => void;
  onRefresh: () => void;
  onBackHome: () => void;
  onBackToSelect: () => void;
}

const DAIFUGO_EFFECT_LABELS: Array<[keyof DaifugoOptions["effects"], string]> = [
  ["fiveSkip", "5"],
  ["sevenExchange", "7"],
  ["eightExtraTurn", "8"],
  ["nineReverse", "9"],
  ["tenSwapDraw", "10"],
  ["jackBack", "J"],
  ["queenNumberVanish", "Q"],
];

const CPU_PUBLIC_LABELS: Record<CpuModelId, string> = {
  easy: "junior",
  standard: "standard",
  tactical: "Pro",
  master: "master",
};

export default function RoomListScreen({ rooms = [], error, onJoinRoom, onRefresh, onBackHome, onBackToSelect }: RoomListScreenProps) {
  return (
    <main className="screen room-choice-screen">
      <section className="room-choice-panel room-list-panel">
        <p className="eyebrow">Join Room</p>
        <h1>募集中ルーム一覧</h1>

        {rooms.length === 0 ? (
          <div className="empty-room-list">
            <strong>現在募集中のルームはありません</strong>
            <span>公開中で参加枠のあるルームが作成されると、ここに表示されます。</span>
          </div>
        ) : (
          <div className="room-list public-room-list" data-testid="public-room-list">
            {rooms.map((room) => {
              const matchRule = getMatchRuleParts(room.matchType, room.roundCount, room.targetScore, room.initialPoints);
              return (
                <article className="room-list-card public-room-card" data-testid="public-room-card" key={room.roomId}>
                  <div className="public-room-grid">
                    <PublicRoomCell label="ルーム名" value={room.roomName} testId="public-room-name" />
                    <PublicRoomCell label="人数" value={`${room.totalPlayers}人プレイ`} />
                    <PublicRoomCell label="試合形式" value={matchRule.typeLabel} />
                    <PublicRoomCell label="詳細" value={matchRule.detailLabel} />
                    <PublicRoomCell label="追加ルール" value={formatDaifugo(room.daifugoOptions)} testId="public-room-extra-rules" />
                    <div className="public-room-cell public-room-recruitment-cell">
                      <span className="public-room-column-label">募集人数</span>
                      <span className="public-room-value" data-testid="public-room-recruitment">
                        募集人数 {room.joinedHumanPlayers}/{room.humanPlayers}人
                      </span>
                      <span className="public-room-value" data-testid="public-room-cpu">
                        {formatCpu(room.cpuPlayers, room.cpuModelIds)}
                      </span>
                    </div>
                  </div>
                  <button type="button" className="join-room-button" data-testid="public-room-join-button" onClick={() => onJoinRoom(room.roomId)}>
                    参加
                  </button>
                </article>
              );
            })}
          </div>
        )}

        {error && <p className="online-error">{error}</p>}

        <div className="room-choice-actions">
          <button type="button" className="secondary-button" onClick={onBackToSelect}>
            ルーム選択に戻る
          </button>
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

function PublicRoomCell({ label, value, testId }: { label: string; value: ReactNode; testId?: string }) {
  return (
    <div className="public-room-cell">
      <span className="public-room-column-label">{label}</span>
      <span className="public-room-value" data-testid={testId}>
        {value}
      </span>
    </div>
  );
}

function getMatchRuleParts(matchType: MatchMode, roundCount?: number, targetScore?: number, initialPoints?: number) {
  if (matchType === "targetScore") {
    return { typeLabel: "目標点制", detailLabel: `${targetScore ?? 0}点目標` };
  }
  if (matchType === "startingPoints") {
    return { typeLabel: "持ち点制", detailLabel: `持ち点${initialPoints ?? 0}点` };
  }
  return { typeLabel: "局数制", detailLabel: `${roundCount ?? 0}局` };
}

function formatDaifugo(options: DaifugoOptions) {
  if (!options.enabled) return "なし";
  const enabledEffects = DAIFUGO_EFFECT_LABELS.filter(([key]) => options.effects[key]).map(([, label]) => label);
  return (
    <span className="public-room-rule-badges">
      <span className="public-room-rule-badge is-main">大富豪あり</span>
      {enabledEffects.map((effect) => (
        <span className="public-room-rule-badge" key={effect}>
          {effect}
        </span>
      ))}
    </span>
  );
}

function formatCpu(cpuPlayers: number, cpuModelIds: CpuModelId[]) {
  if (cpuPlayers <= 0) return "CPUなし";
  const counts = new Map<CpuModelId, number>();
  const models = cpuModelIds.length > 0 ? cpuModelIds.slice(0, cpuPlayers) : [];
  for (let index = 0; index < cpuPlayers; index += 1) {
    const modelId = models[index] ?? models[0] ?? "standard";
    counts.set(modelId, (counts.get(modelId) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([modelId, count]) => `CPU(${CPU_PUBLIC_LABELS[modelId] ?? modelId})${count}体`)
    .join(" / ");
}
