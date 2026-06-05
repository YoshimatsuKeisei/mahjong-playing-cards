interface RoomSelectScreenProps {
  onBackHome: () => void;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
}

export default function RoomSelectScreen({ onBackHome, onCreateRoom, onJoinRoom }: RoomSelectScreenProps) {
  return (
    <main className="screen room-choice-screen">
      <section className="room-choice-panel">
        <p className="eyebrow">New Game</p>
        <h1>ルーム選択</h1>

        <div className="room-choice-options">
          <button type="button" className="room-choice-card" data-testid="local-create-room-choice" onClick={onCreateRoom}>
            <strong>ルームを立ち上げる</strong>
            <span>自分で新しいルームを作成します</span>
          </button>
          <button type="button" className="room-choice-card" data-testid="online-join-room-choice" onClick={onJoinRoom}>
            <strong>ルームに入る</strong>
            <span>現在募集中のルームに参加します</span>
          </button>
        </div>

        <div className="room-choice-actions">
          <button type="button" className="secondary-button" onClick={onBackHome}>
            ホーム画面に戻る
          </button>
        </div>
      </section>
    </main>
  );
}
