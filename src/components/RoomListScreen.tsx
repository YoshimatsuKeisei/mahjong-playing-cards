import type { OnlinePublicRoom } from "../online/types";
import type { CpuModelId, DaifugoOptions, MatchMode } from "../types";

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
            {rooms.map((room) => (
              <article className="room-list-card public-room-card" data-testid="public-room-card" key={room.roomId}>
                <div className="public-room-card-main">
                  <strong data-testid="public-room-name">{room.roomName}</strong>
                  <span>{room.totalPlayers}人対戦</span>
                  <span>{formatMatchRule(room.matchType, room.roundCount, room.targetScore, room.initialPoints)}</span>
                  <span>{formatDaifugo(room.daifugoOptions)}</span>
                  <span data-testid="public-room-recruitment">募集人数 {room.joinedHumanPlayers}/{room.humanPlayers}人</span>
                  <span data-testid="public-room-cpu">{formatCpu(room.cpuPlayers, room.cpuModelIds)}</span>
                </div>
                <button type="button" className="join-room-button" data-testid="public-room-join-button" onClick={() => onJoinRoom(room.roomId)}>
                  参加
                </button>
              </article>
            ))}
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

function formatMatchRule(matchType: MatchMode, roundCount?: number, targetScore?: number, initialPoints?: number) {
  if (matchType === "targetScore") return `目標点制 ${targetScore ?? 0}点`;
  if (matchType === "startingPoints") return `持ち点制 持ち点${initialPoints ?? 0}点`;
  return `局数制 ${roundCount ?? 0}局`;
}

function formatDaifugo(options: DaifugoOptions) {
  if (!options.enabled) return "大富豪なし";
  const enabledEffects = DAIFUGO_EFFECT_LABELS.filter(([key]) => options.effects[key]).map(([, label]) => label);
  return enabledEffects.length > 0 ? `大富豪あり（${enabledEffects.join(", ")}）` : "大富豪あり";
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
