import type { Direction, GameState, MatchState } from "../types";
import type { GameAction } from "../game/gameState";

export type OnlineScenarioId =
  | "online-tsumo-basic"
  | "online-reach-tsumo"
  | "online-reach-declare"
  | "online-reach-draw-tsumo"
  | "online-reach-discard-drawn-only"
  | "online-reach-discard-ron"
  | "online-reach-invalid-discard"
  | "online-reach-cannot-call"
  | "online-q-after-draw-tsumo"
  | "online-effect-5"
  | "online-effect-7"
  | "online-effect-8"
  | "online-effect-9"
  | "online-effect-10"
  | "online-effect-j-enhance"
  | "online-effect-j-view"
  | "online-effect-j-shield"
  | "online-effect-q"
  | "online-effect-q-after-win"
  | "online-effect-invalid"
  | "online-round-deckout"
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
  matchState?: MatchState | null;
}

export interface SubmitActionPayload {
  action: GameAction;
  stateVersion: number;
}

export type ActionRejectedReason =
  | "not_your_reaction"
  | "not_host"
  | "not_your_turn"
  | "stale_state_version"
  | "card_not_in_hand"
  | "room_not_playing"
  | "invalid_action_for_phase"
  | "invalid_call_candidate"
  | "invalid_ron_candidate"
  | "invalid_tsumo_candidate"
  | "tsumo_available_reach_not_allowed"
  | "invalid_reach_candidate"
  | "already_reached"
  | "cannot_reach_after_call"
  | "reach_hand_locked"
  | "discard_drawn_only_required"
  | "invalid_action_for_reach_phase"
  | "reach_player_cannot_call"
  | "invalid_seven_exchange_target"
  | "invalid_seven_exchange_card"
  | "shielded_card_cannot_exchange"
  | "invalid_five_skip_target"
  | "invalid_j_effect_choice"
  | "invalid_j_view_target"
  | "invalid_j_shield_target"
  | "invalid_q_effect_phase"
  | "q_rank_not_selectable"
  | "invalid_effect_discard_card";

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
  nextRound: () => void;
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
