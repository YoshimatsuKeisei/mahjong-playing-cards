import type { Direction, GameState } from "../types";
import type { GameAction } from "../game/gameState";

export type OnlineScenarioId =
  | "online-tsumo-basic"
  | "online-reach-tsumo"
  | "online-q-after-draw-tsumo"
  | "online-call-basic"
  | "online-ron-basic"
  | "online-double-ron";

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
  scenario?: OnlineScenarioId;
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

export interface SubmitActionPayload {
  action: GameAction;
  stateVersion: number;
}

export type ActionRejectedReason =
  | "not_your_reaction"
  | "not_your_turn"
  | "stale_state_version"
  | "card_not_in_hand"
  | "room_not_playing"
  | "invalid_action_for_phase"
  | "invalid_call_candidate"
  | "invalid_ron_candidate"
  | "invalid_tsumo_candidate";

export interface ActionRejectedPayload {
  reason: ActionRejectedReason;
  expectedStateVersion: number | null;
  playerView: OnlinePlayerViewPayload | null;
}

export interface ServerToClientEvents {
  roomUpdated: (room: OnlineRoomSnapshot) => void;
  playerView: (payload: OnlinePlayerViewPayload) => void;
  actionRejected: (payload: ActionRejectedPayload) => void;
  errorMessage: (message: string) => void;
}

export interface ClientToServerEvents {
  createRoom: (payload: CreateRoomPayload, ack: (response: OnlineAck) => void) => void;
  joinRoom: (payload: JoinRoomPayload, ack: (response: OnlineAck) => void) => void;
  ready: (payload: { ready: boolean }) => void;
  startGame: () => void;
  submitAction: (payload: SubmitActionPayload) => void;
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
