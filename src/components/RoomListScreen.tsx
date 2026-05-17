interface ListedRoom {
  id: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  ruleLabel: string;
}

interface RoomListScreenProps {
  rooms?: ListedRoom[];
  onBackHome: () => void;
  onBackToSelect: () => void;
}

export default function RoomListScreen({ rooms = [], onBackHome, onBackToSelect }: RoomListScreenProps) {
  return (
    <main className="screen room-choice-screen">
      <section className="room-choice-panel room-list-panel">
        <p className="eyebrow">Join Room</p>
        <h1>募集中ルーム一覧</h1>

        {rooms.length === 0 ? (
          <div className="empty-room-list">
            <strong>現在募集中のルームはありません</strong>
            <span>オンライン接続は今後のアップデートで対応予定です</span>
          </div>
        ) : (
          <div className="room-list">
            {rooms.map((room) => (
              <article className="room-list-card" key={room.id}>
                <div>
                  <strong>{room.hostName}</strong>
                  <span>{room.ruleLabel}</span>
                </div>
                <em>
                  {room.playerCount}/{room.maxPlayers}
                </em>
              </article>
            ))}
          </div>
        )}

        <div className="room-choice-actions">
          <button type="button" className="secondary-button" onClick={onBackToSelect}>
            ルーム選択に戻る
          </button>
          <button type="button" onClick={onBackHome}>
            ホーム画面に戻る
          </button>
        </div>
      </section>
    </main>
  );
}
