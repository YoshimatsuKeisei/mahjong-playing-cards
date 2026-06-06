import { useState } from "react";
import type { OnlineRoomSnapshot, OnlineScenarioId } from "../online/types";

interface OnlineLobbyScreenProps {
  room: OnlineRoomSnapshot | null;
  playerId: string | null;
  error: string | null;
  onCreateRoom: (playerName: string, maxPlayers: number, scenario?: OnlineScenarioId) => void;
  onJoinRoom: (roomId: string, playerName: string) => void;
  onReady: (ready: boolean) => void;
  onStartGame: () => void;
  onBack: () => void;
  showRoomId?: boolean;
}

export default function OnlineLobbyScreen({
  room,
  playerId,
  error,
  onCreateRoom,
  onJoinRoom,
  onReady,
  onStartGame,
  onBack,
  showRoomId = true,
}: OnlineLobbyScreenProps) {
  const [playerName, setPlayerName] = useState("Guest Player");
  const [roomId, setRoomId] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(4);
  const scenario =
    import.meta.env.DEV
      ? ((new URLSearchParams(window.location.search).get("scenario") || undefined) as OnlineScenarioId | undefined)
      : undefined;
  const currentPlayer = room?.players.find((player) => player.playerId === playerId) ?? null;
  const isHost = Boolean(room && playerId === room.hostPlayerId);
  const canStart = Boolean(room && isHost && room.players.length >= 2 && room.players.every((player) => player.ready || player.playerId === room.hostPlayerId));

  return (
    <main className="screen room-choice-screen">
      <section className="room-choice-panel room-list-panel">
        <p className="eyebrow">Local Online</p>
        <h1>ローカル対戦ルーム</h1>

        {!room ? (
          <div className="online-room-form">
            <label className="field">
              <span>名前</span>
              <input data-testid="player-name-input" value={playerName} onChange={(event) => setPlayerName(event.target.value)} />
            </label>
            <label className="field">
              <span>人数</span>
              <select value={maxPlayers} onChange={(event) => setMaxPlayers(Number(event.target.value))}>
                {[2, 3, 4, 5].map((count) => (
                  <option value={count} key={count}>
                    {count}人
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="primary-button" data-testid="create-room-button" onClick={() => onCreateRoom(playerName, maxPlayers, scenario)}>
              部屋を作る
            </button>

            <label className="field">
              <span>部屋ID</span>
              <input data-testid="room-id-input" value={roomId} onChange={(event) => setRoomId(event.target.value.toUpperCase())} />
            </label>
            <button type="button" data-testid="join-room-button" onClick={() => onJoinRoom(roomId, playerName)}>
              部屋に入る
            </button>
          </div>
        ) : (
          <div className="online-room-form" data-testid="online-lobby-screen">
            <div className="empty-room-list">
              {showRoomId ? <strong data-testid="room-id">Room ID: {room.roomId}</strong> : <strong data-testid="online-lobby-title">参加ロビー</strong>}
              <span>
                {room.players.length}/{room.maxPlayers} players
              </span>
            </div>
            <div className="room-list">
              {room.players.map((player) => (
                <article className="room-list-card" key={player.playerId}>
                  <div>
                    <strong>{player.name}</strong>
                    <span>{player.playerId === room.hostPlayerId ? "Host" : player.connected ? "Connected" : "Disconnected"}</span>
                  </div>
                  <em>{player.ready || player.playerId === room.hostPlayerId ? "Ready" : "Waiting"}</em>
                </article>
              ))}
            </div>
            {!isHost && currentPlayer && (
              <button type="button" className="primary-button" data-testid="ready-button" onClick={() => onReady(!currentPlayer.ready)}>
                {currentPlayer.ready ? "準備を解除" : "Ready"}
              </button>
            )}
            {isHost && (
              <button type="button" className="primary-button" data-testid="start-game-button" disabled={!canStart} onClick={onStartGame}>
                Start Game
              </button>
            )}
          </div>
        )}

        {error && <p className="online-error">{error}</p>}

        <div className="room-choice-actions">
          <button type="button" className="secondary-button" data-testid="online-lobby-back-button" onClick={onBack}>
            戻る
          </button>
        </div>
      </section>
    </main>
  );
}
