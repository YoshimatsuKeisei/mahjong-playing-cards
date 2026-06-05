import type { Direction, GameState } from "../types";
import type { GameAction } from "../game/gameState";

export interface OnlineRoomPlayer {
  playerId: string;
  name: string;
  ready: boolean;
  connected: boolean;
}

export interface OnlineRoomSnapshot {
  roomId: string;
  hostPlayerId: string;
  maxPlayers: number;
  players: OnlineRoomPlayer[];
  started: boolean;
}

export interface CreateRoomPayload {
  playerName: string;
  maxPlayers?: number;
  direction?: Direction;
}

export interface JoinRoomPayload {
  roomId: string;
  playerName: string;
}

export interface OnlinePlayerViewPayload {
  room: OnlineRoomSnapshot;
  playerId: string;
  state: GameState | null;
}

export interface ServerToClientEvents {
  roomUpdated: (room: OnlineRoomSnapshot) => void;
  playerView: (payload: OnlinePlayerViewPayload) => void;
  errorMessage: (message: string) => void;
}

export interface ClientToServerEvents {
  createRoom: (payload: CreateRoomPayload, ack: (response: OnlineAck) => void) => void;
  joinRoom: (payload: JoinRoomPayload, ack: (response: OnlineAck) => void) => void;
  ready: (payload: { ready: boolean }) => void;
  startGame: () => void;
  submitAction: (action: GameAction) => void;
}

export type OnlineAck =
  | {
      ok: true;
      roomId: string;
      playerId: string;
      room: OnlineRoomSnapshot;
      state: GameState | null;
    }
  | {
      ok: false;
      error: string;
    };
