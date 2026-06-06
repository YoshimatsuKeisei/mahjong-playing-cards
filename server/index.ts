import { createServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { createDefaultDaifugoOptions } from "../src/game/deck";
import {
  createInitialGame,
  gameReducer,
  getEnhancedFiveTurnOptions,
  getAvailableDiscardSources,
  getCallOptionsForSource,
  getJackShieldRunOptions,
  getWinningDiscardOptions,
  getQueenVanishRankOptions,
  getSevenExchangeCandidateCards,
  isCardJShielded,
  type GameAction,
} from "../src/game/gameState";
import { createPlayerViewState } from "../src/online/playerView";
import { applyOnlineScenario } from "./onlineScenarios";
import { canDeclareReachAfterDraw } from "../src/game/rules";
import { advanceRound, canAdvanceRound, createMatchState, syncMatchGameState } from "../src/game/matchState";
import type {
  ActionRejectedReason,
  ClientToServerEvents,
  OnlinePlayerViewPayload,
  OnlineRoomPlayer,
  OnlineRoomSnapshot,
  ServerToClientEvents,
  type OnlineScenarioId,
} from "../src/online/types";
import type { Direction, GameState, MatchState } from "../src/types";

interface ServerRoom {
  id: string;
  hostPlayerId: string;
  maxPlayers: number;
  direction: Direction;
  players: OnlineRoomPlayer[];
  socketsByPlayerId: Map<string, string>;
  state: GameState | null;
  matchState: MatchState | null;
  stateVersion: number;
  started: boolean;
  scenario?: OnlineScenarioId;
}

interface SocketData {
  roomId?: string;
  playerId?: string;
}

type OnlineSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const PORT = Number(process.env.ONLINE_PORT ?? 3001);
const rooms = new Map<string, ServerRoom>();

const httpServer = createServer();
const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
  cors: {
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
  },
});

function createRoomId(): string {
  let id = "";
  do {
    id = Math.random().toString(36).slice(2, 8).toUpperCase();
  } while (rooms.has(id));
  return id;
}

function createPlayerId(room: ServerRoom): string {
  return `player-${room.players.length + 1}`;
}

function snapshotRoom(room: ServerRoom): OnlineRoomSnapshot {
  return {
    roomId: room.id,
    hostPlayerId: room.hostPlayerId,
    maxPlayers: room.maxPlayers,
    players: room.players,
    started: room.started,
  };
}

function getSocketRoom(socket: OnlineSocket): ServerRoom | null {
  const roomId = socket.data.roomId;
  return roomId ? rooms.get(roomId) ?? null : null;
}

function createPlayerViewPayload(room: ServerRoom, playerId: string): OnlinePlayerViewPayload {
  const playerViewState = room.state ? createPlayerViewState(room.state, playerId) : null;
  return {
    room: snapshotRoom(room),
    playerId,
    state: playerViewState,
    matchState: room.matchState && playerViewState ? { ...room.matchState, gameState: playerViewState } : null,
  };
}

function emitPlayerView(room: ServerRoom, playerId: string) {
  const socketId = room.socketsByPlayerId.get(playerId);
  if (!socketId) return;
  io.to(socketId).emit("playerView", createPlayerViewPayload(room, playerId));
}

function broadcastPlayerView(room: ServerRoom) {
  const snapshot = snapshotRoom(room);
  for (const player of room.players) {
    const socketId = room.socketsByPlayerId.get(player.playerId);
    if (!socketId) continue;
    io.to(socketId).emit("roomUpdated", snapshot);
    emitPlayerView(room, player.playerId);
  }
}

function leaveCurrentRoom(socket: OnlineSocket) {
  const room = getSocketRoom(socket);
  const playerId = socket.data.playerId;
  if (!room || !playerId) return;
  room.socketsByPlayerId.delete(playerId);
  room.players = room.players.map((player) => (player.playerId === playerId ? { ...player, connected: false } : player));
  broadcastPlayerView(room);
}

function rejectAction(socket: OnlineSocket, room: ServerRoom | null, playerId: string | undefined, reason: ActionRejectedReason) {
  socket.emit("actionRejected", {
    reason,
    expectedStateVersion: room?.state ? room.stateVersion : null,
    playerView: room && playerId ? createPlayerViewPayload(room, playerId) : null,
  });
  if (room && playerId) emitPlayerView(room, playerId);
}

const pendingEffectActions = new Set<GameAction["type"]>([
  "answerDaifugoEffect",
  "answerSevenEnhancement",
  "finishSevenEnhancementSplash",
  "selectEnhancedSevenTarget",
  "confirmEnhancedSevenTarget",
  "answerFiveEnhancement",
  "finishFiveEnhancementSplash",
  "selectEnhancedFiveTarget",
  "confirmEnhancedFiveTarget",
  "drawForDaifugoEffect",
  "discardForDaifugoEffect",
  "selectSevenExchangeCard",
  "selectQueenVanishRank",
  "answerQueenWin",
  "selectJackSpecialEffect",
  "selectJackShieldRank",
  "selectJackShieldRun",
  "inspectJackCard",
  "confirmJackInspectCard",
  "answerReachContinue",
]);

function validatePendingEffectAction(state: GameState, playerIndex: number, action: GameAction): ActionRejectedReason | null {
  const pending = state.pendingDaifugoEffect;
  if (!pending) return "invalid_action_for_phase";
  if (!pendingEffectActions.has(action.type)) return "invalid_action_for_phase";
  if ("playerIndex" in pending && pending.playerIndex !== playerIndex) {
    if (!(pending.kind === "sevenExchange" && action.type === "selectSevenExchangeCard" && action.playerIndex === playerIndex)) {
      return "not_your_reaction";
    }
  }

  if (action.type === "answerDaifugoEffect") return pending.kind === "confirm" ? null : "invalid_action_for_phase";
  if (action.type === "answerSevenEnhancement") return pending.kind === "sevenEnhancementConfirm" ? null : "invalid_action_for_phase";
  if (action.type === "finishSevenEnhancementSplash") return pending.kind === "sevenEnhancementSplash" ? null : "invalid_action_for_phase";
  if (action.type === "selectEnhancedSevenTarget") {
    if (pending.kind !== "sevenEnhancedTargetSelect") return "invalid_action_for_phase";
    return action.targetPlayerIndex !== pending.playerIndex && Boolean(state.players[action.targetPlayerIndex])
      ? null
      : "invalid_seven_exchange_target";
  }
  if (action.type === "confirmEnhancedSevenTarget") {
    if (pending.kind !== "sevenEnhancedTargetSelect") return "invalid_action_for_phase";
    return pending.selectedTargetPlayerIndex !== undefined &&
      pending.selectedTargetPlayerIndex !== pending.playerIndex &&
      Boolean(state.players[pending.selectedTargetPlayerIndex])
      ? null
      : "invalid_seven_exchange_target";
  }
  if (action.type === "answerFiveEnhancement") return pending.kind === "fiveEnhancementConfirm" ? null : "invalid_action_for_phase";
  if (action.type === "finishFiveEnhancementSplash") return pending.kind === "fiveEnhancementSplash" ? null : "invalid_action_for_phase";
  if (action.type === "selectEnhancedFiveTarget") {
    if (pending.kind !== "fiveEnhancedTargetSelect") return "invalid_action_for_phase";
    const option = getEnhancedFiveTurnOptions(state, pending.playerIndex).find((candidate) => candidate.playerIndex === action.targetPlayerIndex);
    return option?.selectable ? null : "invalid_five_skip_target";
  }
  if (action.type === "confirmEnhancedFiveTarget") {
    if (pending.kind !== "fiveEnhancedTargetSelect") return "invalid_action_for_phase";
    return pending.selectedTargetPlayerIndex !== undefined && Boolean(state.players[pending.selectedTargetPlayerIndex])
      ? null
      : "invalid_five_skip_target";
  }
  if (action.type === "drawForDaifugoEffect") return pending.kind === "effectDraw" ? null : "invalid_action_for_phase";
  if (action.type === "selectQueenVanishRank") {
    if (pending.kind !== "queenSelect") return "invalid_q_effect_phase";
    const option = getQueenVanishRankOptions(state).find((candidate) => candidate.rank === action.rank);
    return option?.selectable ? null : "q_rank_not_selectable";
  }
  if (action.type === "answerQueenWin") return pending.kind === "queenWinConfirm" ? null : "invalid_tsumo_candidate";
  if (action.type === "discardForDaifugoEffect") {
    if (pending.kind !== "extraDiscard") return "invalid_action_for_phase";
    const player = state.players[playerIndex];
    const discardCard = player?.hand.find((card) => card.id === action.cardId) ?? null;
    if (!discardCard) return "invalid_effect_discard_card";
    if (isCardJShielded(player, discardCard)) return "shielded_card_cannot_exchange";
    if (
      pending.effect === "eightExtraTurn" &&
      player?.isReach &&
      !state.declaredReachThisTurn &&
      action.cardId !== state.drawnCard?.id
    ) {
      return "discard_drawn_only_required";
    }
    return null;
  }
  if (action.type === "selectSevenExchangeCard") {
    if (pending.kind !== "sevenExchange") return "invalid_action_for_phase";
    if (action.playerIndex !== playerIndex) return "not_your_reaction";
    const player = state.players[playerIndex];
    const selected = player?.hand.find((card) => card.id === action.cardId) ?? null;
    if (!selected) return "invalid_seven_exchange_card";
    if (isCardJShielded(player, selected)) return "shielded_card_cannot_exchange";
    const candidates = getSevenExchangeCandidateCards(player, playerIndex === pending.playerIndex);
    if (!candidates.some((card) => card.id === action.cardId)) return "invalid_seven_exchange_card";
    return null;
  }
  if (action.type === "selectJackSpecialEffect") {
    if (pending.kind !== "jackSelect") return "invalid_action_for_phase";
    return ["inspectHands", "jShield", "enhanceFiveOrSeven"].includes(action.effect) ? null : "invalid_j_effect_choice";
  }
  if (action.type === "selectJackShieldRank") {
    if (pending.kind !== "jackShieldSelect") return "invalid_action_for_phase";
    return pending.selectableRanks.includes(action.rank) ? null : "invalid_j_shield_target";
  }
  if (action.type === "selectJackShieldRun") {
    if (pending.kind !== "jackShieldSelect") return "invalid_action_for_phase";
    return getJackShieldRunOptions(state.players[playerIndex]).some((run) => run.key === action.key) ? null : "invalid_j_shield_target";
  }
  if (action.type === "inspectJackCard") {
    if (pending.kind !== "jackInspect") return "invalid_action_for_phase";
    const targetPlayerIndex = pending.targetPlayerIndexes[pending.currentTargetOffset];
    if (targetPlayerIndex !== action.targetPlayerIndex) return "invalid_j_view_target";
    const targetPlayer = state.players[targetPlayerIndex];
    if (!targetPlayer?.hand.some((card) => card.id === action.cardId)) return "invalid_j_view_target";
    if (pending.revealedCardIds[targetPlayerIndex]) return "invalid_action_for_phase";
    return null;
  }
  if (action.type === "confirmJackInspectCard") {
    if (pending.kind !== "jackInspect") return "invalid_action_for_phase";
    const targetPlayerIndex = pending.targetPlayerIndexes[pending.currentTargetOffset];
    return targetPlayerIndex !== undefined && Boolean(pending.revealedCardIds[targetPlayerIndex]) ? null : "invalid_action_for_phase";
  }
  if (action.type === "answerReachContinue") {
    if (pending.kind !== "reachContinueConfirm") return "invalid_action_for_phase";
    return null;
  }
  return null;
}

function validateOnlineAction(room: ServerRoom, playerId: string, action: GameAction): ActionRejectedReason | null {
  if (!room.state || !room.started) return "room_not_playing";
  if (action.type === "start" || action.type === "restart") return "invalid_action_for_phase";
  const playerIndex = room.state.players.findIndex((player) => player.id === playerId);
  if (playerIndex < 0) return "room_not_playing";

  if (action.type === "answerRon") {
    if (room.state.phase !== "ronCheck" || !room.state.pendingRonResult) return "invalid_action_for_phase";
    const canAnswer = room.state.pendingRonResult.ronResults?.some((item) => item.winnerIndex === playerIndex) ?? false;
    return canAnswer ? null : "not_your_reaction";
  }

  if (pendingEffectActions.has(action.type)) {
    return validatePendingEffectAction(room.state, playerIndex, action);
  }

  if (action.type === "confirmHandoff") {
    return room.state.phase === "handoff" && !room.state.pendingDaifugoEffect ? null : "invalid_action_for_phase";
  }

  if (room.state.currentPlayerIndex !== playerIndex) return "not_your_turn";

  if (action.type === "drawFromDeck") {
    if (room.state.phase !== "draw") return "invalid_action_for_phase";
    return null;
  }
  if (action.type === "takeDiscard") {
    if (room.state.phase !== "draw") return "invalid_action_for_phase";
    if (room.state.players[playerIndex]?.isReach) return "reach_player_cannot_call";
    if (!getAvailableDiscardSources(room.state).includes(action.ownerIndex)) return "invalid_call_candidate";
    if (!action.meld) return "invalid_call_candidate";
    const legalOptions = getCallOptionsForSource(room.state, action.ownerIndex);
    const meldIds = action.meld.map((card) => card.id).sort().join("|");
    const isLegalMeld = legalOptions.some((option) => option.map((card) => card.id).sort().join("|") === meldIds);
    return isLegalMeld ? null : "invalid_call_candidate";
  }
  if (action.type === "winWithDiscard") {
    if (room.state.phase !== "discard") return "invalid_action_for_phase";
    const legalOptions = getWinningDiscardOptions(room.state);
    return legalOptions.some((option) => option.discardCard.id === action.discardCardId) ? null : "invalid_tsumo_candidate";
  }
  if (action.type === "discardDrawnOnly") {
    if (room.state.phase !== "discard" || !room.state.drawnCard) return "invalid_action_for_phase";
    const player = room.state.players[playerIndex];
    if (!player.isReach) return "invalid_action_for_reach_phase";
    if (room.state.declaredReachThisTurn) return "invalid_action_for_reach_phase";
    if (getWinningDiscardOptions(room.state).length > 0) return "invalid_tsumo_candidate";
    return null;
  }
  if (action.type === "declareReach") {
    if (room.state.phase !== "discard" || room.state.drawnFrom !== "deck") return "invalid_action_for_phase";
    if (getWinningDiscardOptions(room.state).length > 0) return "tsumo_available_reach_not_allowed";
    const player = room.state.players[playerIndex];
    if (player.isReach) return "already_reached";
    if (player.hasCalled) return "cannot_reach_after_call";
    return canDeclareReachAfterDraw(player.hand, player.hasCalled, player.isReach) ? null : "invalid_reach_candidate";
  }
  if (action.type === "answerReachAfterDiscard") {
    return room.state.phase === "reachConfirm" ? null : "invalid_action_for_phase";
  }
  if (action.type !== "discard") return "invalid_action_for_phase";
  if (room.state.phase !== "discard") return "invalid_action_for_phase";
  const player = room.state.players[playerIndex];
  if (!player.hand.some((card) => card.id === action.cardId)) return "card_not_in_hand";
  if (player.isReach && !room.state.declaredReachThisTurn) {
    return action.cardId === room.state.drawnCard?.id ? "discard_drawn_only_required" : "reach_hand_locked";
  }
  return null;
}

function advanceOnlineHandoff(nextState: GameState): GameState {
  if (nextState.phase !== "handoff" || nextState.pendingDaifugoEffect) return nextState;
  return gameReducer(nextState, { type: "confirmHandoff" });
}

function startRoomGame(room: ServerRoom) {
  room.stateVersion = 0;
  room.matchState = createMatchState(
    "rounds",
    room.players.length,
    room.direction,
    3,
    room.id,
    room.players.length,
    "standard",
    createDefaultDaifugoOptions(),
    [],
    false,
  );
  room.state = room.matchState.gameState;
  room.state = {
    ...room.state,
    stateVersion: room.stateVersion,
    players: room.state.players.map((player, index) => ({
      ...player,
      id: room.players[index].playerId,
      name: room.players[index].name,
      type: "human",
      isCpu: false,
    })),
  };
  room.state = applyOnlineScenario(room.state, room.scenario);
  room.state = { ...room.state, stateVersion: room.stateVersion };
  room.matchState = room.matchState ? { ...room.matchState, gameState: room.state } : null;
  room.started = true;
}

function applyOnlineNextState(room: ServerRoom, nextState: GameState) {
  room.stateVersion += 1;
  room.state = { ...nextState, stateVersion: room.stateVersion };
  room.matchState = syncMatchGameState(room.matchState, room.state);
}

function remapOnlinePlayers(room: ServerRoom, state: GameState): GameState {
  return {
    ...state,
    stateVersion: room.stateVersion,
    players: state.players.map((player, index) => ({
      ...player,
      id: room.players[index].playerId,
      name: room.players[index].name,
      type: "human",
      isCpu: false,
    })),
  };
}

io.on("connection", (socket) => {
  socket.on("createRoom", (payload, ack) => {
    const roomId = createRoomId();
    const room: ServerRoom = {
      id: roomId,
      hostPlayerId: "player-1",
      maxPlayers: payload.maxPlayers ?? 4,
      direction: payload.direction ?? "clockwise",
      players: [],
      socketsByPlayerId: new Map(),
      state: null,
      matchState: null,
      stateVersion: 0,
      started: false,
      scenario: payload.scenario,
    };
    const player: OnlineRoomPlayer = {
      playerId: createPlayerId(room),
      name: payload.playerName || "Player 1",
      ready: false,
      connected: true,
    };
    room.players.push(player);
    room.socketsByPlayerId.set(player.playerId, socket.id);
    rooms.set(roomId, room);
    socket.data.roomId = roomId;
    socket.data.playerId = player.playerId;
    socket.join(roomId);
    ack({ ok: true, roomId, playerId: player.playerId, room: snapshotRoom(room), state: null });
    broadcastPlayerView(room);
  });

  socket.on("joinRoom", (payload, ack) => {
    const room = rooms.get(payload.roomId.trim().toUpperCase());
    if (!room) {
      ack({ ok: false, error: "Room not found." });
      return;
    }
    if (room.started) {
      ack({ ok: false, error: "Game has already started." });
      return;
    }
    if (room.players.length >= room.maxPlayers) {
      ack({ ok: false, error: "Room is full." });
      return;
    }
    const player: OnlineRoomPlayer = {
      playerId: createPlayerId(room),
      name: payload.playerName || `Player ${room.players.length + 1}`,
      ready: false,
      connected: true,
    };
    room.players.push(player);
    room.socketsByPlayerId.set(player.playerId, socket.id);
    socket.data.roomId = room.id;
    socket.data.playerId = player.playerId;
    socket.join(room.id);
    ack({ ok: true, roomId: room.id, playerId: player.playerId, room: snapshotRoom(room), state: null });
    broadcastPlayerView(room);
  });

  socket.on("ready", (payload) => {
    const room = getSocketRoom(socket);
    const playerId = socket.data.playerId;
    if (!room || !playerId || room.started) return;
    room.players = room.players.map((player) => (player.playerId === playerId ? { ...player, ready: payload.ready } : player));
    broadcastPlayerView(room);
  });

  socket.on("startGame", () => {
    const room = getSocketRoom(socket);
    const playerId = socket.data.playerId;
    if (!room || !playerId || room.started) return;
    if (room.hostPlayerId !== playerId) {
      socket.emit("errorMessage", "Only the host can start the game.");
      return;
    }
    if (room.players.length < 2 || !room.players.every((player) => player.ready || player.playerId === room.hostPlayerId)) {
      socket.emit("errorMessage", "Need at least two players, and all guests must be ready.");
      return;
    }
    startRoomGame(room);
    broadcastPlayerView(room);
  });

  socket.on("submitAction", (payload) => {
    const room = getSocketRoom(socket);
    const playerId = socket.data.playerId;
    if (!room || !playerId) return;
    if (!room.state || !room.started) {
      rejectAction(socket, room, playerId, "room_not_playing");
      return;
    }
    if (payload.stateVersion !== room.stateVersion) {
      rejectAction(socket, room, playerId, "stale_state_version");
      return;
    }
    const rejection = validateOnlineAction(room, playerId, payload.action);
    if (rejection) {
      rejectAction(socket, room, playerId, rejection);
      return;
    }
    let nextState = advanceOnlineHandoff(gameReducer(room.state, payload.action));
    if (nextState === room.state) {
      rejectAction(socket, room, playerId, "invalid_action_for_phase");
      return;
    }
    applyOnlineNextState(room, nextState);
    broadcastPlayerView(room);
  });

  socket.on("nextRound", () => {
    const room = getSocketRoom(socket);
    const playerId = socket.data.playerId;
    if (!room || !playerId || !room.state || !room.started || !room.matchState) return;
    if (room.hostPlayerId !== playerId) {
      rejectAction(socket, room, playerId, "not_host");
      return;
    }
    if (room.state.phase !== "result" || !room.state.result) {
      rejectAction(socket, room, playerId, "invalid_action_for_phase");
      return;
    }
    const syncedMatch = syncMatchGameState(room.matchState, room.state);
    if (!syncedMatch || !canAdvanceRound(syncedMatch)) {
      rejectAction(socket, room, playerId, "invalid_action_for_phase");
      return;
    }
    const nextMatch = advanceRound(syncedMatch);
    room.stateVersion += 1;
    const nextGameState = remapOnlinePlayers(room, nextMatch.gameState);
    room.state = nextGameState;
    room.matchState = { ...nextMatch, gameState: nextGameState };
    broadcastPlayerView(room);
  });

  socket.on("disconnect", () => {
    leaveCurrentRoom(socket);
  });
});

httpServer.listen(PORT, () => {
  console.info(`Local online server listening on http://localhost:${PORT}`);
});
