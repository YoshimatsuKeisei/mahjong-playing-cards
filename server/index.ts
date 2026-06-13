import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { Server, type Socket } from "socket.io";
import { createDefaultDaifugoOptions } from "../src/game/deck";
import {
  createRandomStartPlayerIndex,
  gameReducer,
  getEnhancedFiveTurnOptions,
  getAvailableDiscardSources,
  getCallOptionsForSource,
  getJackShieldRunOptions,
  getWinningDiscardOptions,
  getQueenVanishRankOptions,
  getSevenExchangeCandidateCards,
  canDeclareReachInCurrentState,
  canKeepReachAfterDiscard,
  isCardJShielded,
  type GameAction,
} from "../src/game/gameState";
import { createPlayerViewState } from "../src/online/playerView";
import { applyOnlineScenario } from "./onlineScenarios";
import { cancelOnlineCpu, scheduleOnlineCpu } from "./onlineCpuRunner";
import {
  advanceRound,
  canAdvanceRound,
  createMatchState,
  syncMatchGameState,
} from "../src/game/matchState";
import type {
  ActionRejectedReason,
  ClientToServerEvents,
  OnlinePublicRoom,
  OnlineRoomCreateSettings,
  OnlinePlayerViewPayload,
  OnlineRoomPlayer,
  OnlineRoomSnapshot,
  ResumableGameEntry,
  ResumableGameSummary,
  ServerToClientEvents,
  TemporaryLeaveMode,
  LeaveRoomPayload,
  OnlineScenarioId,
} from "../src/online/types";
import type {
  CpuModelId,
  Direction,
  GameState,
  MatchState,
} from "../src/types";

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
  createdAt: number;
  roomSettings?: OnlineRoomCreateSettings;
  nextPlayerNumber: number;
  temporaryLeaves: Map<string, TemporaryLeaveState>;
  substituteCpuModelIds: Map<string, CpuModelId>;
}

interface SocketData {
  roomId?: string;
  playerId?: string;
}

type TemporaryLeaveState = {
  playerId: string;
  playerIndex: number;
  mode: TemporaryLeaveMode;
  startedAt: number;
  expiresAt: number;
  resumeToken: string;
  timeoutId?: NodeJS.Timeout;
  convertedToCpu: boolean;
};

type OnlineSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

const PORT = Number(process.env.ONLINE_PORT ?? 3001);
const rooms = new Map<string, ServerRoom>();
const MAX_ROUND_COUNT = 100;
const MIN_TARGET_SCORE = 50;
const MAX_TARGET_SCORE = 10000;
const TEMPORARY_LEAVE_LIMIT_MS = 15 * 60 * 1000;

const httpServer = createServer();
const io = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>(httpServer, {
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
  const playerId = `player-${room.nextPlayerNumber}`;
  room.nextPlayerNumber += 1;
  return playerId;
}

function snapshotRoom(room: ServerRoom): OnlineRoomSnapshot {
  return {
    roomId: room.id,
    hostPlayerId: room.hostPlayerId,
    maxPlayers: room.maxPlayers,
    totalPlayers: room.roomSettings?.totalPlayers ?? room.maxPlayers,
    cpuPlayers: room.roomSettings?.cpuPlayers ?? 0,
    players: room.players,
    started: room.started,
    temporaryLeaves: Array.from(room.temporaryLeaves.values()).map((leave) => ({
      playerId: leave.playerId,
      playerName:
        room.state?.players[leave.playerIndex]?.name ??
        room.players.find((player) => player.playerId === leave.playerId)
          ?.name ??
        leave.playerId,
      playerIndex: leave.playerIndex,
      mode: leave.mode,
      expiresAt: leave.expiresAt,
      convertedToCpu: leave.convertedToCpu,
    })),
    substituteCpuModels: Array.from(room.substituteCpuModelIds.entries()).map(
      ([playerId, cpuModelId]) => ({ playerId, cpuModelId }),
    ),
  };
}

function isJoinableReplacementPlayer(room: ServerRoom, playerId: string) {
  if (room.temporaryLeaves.has(playerId)) return false;
  const player = room.state?.players.find((item) => item.id === playerId);
  return Boolean(player?.isCpu && player.joinableReplacement);
}

function getJoinableReplacementSeatIndexes(room: ServerRoom) {
  if (!room.roomSettings?.allowMidGameJoin || !room.started || !room.state) {
    return [];
  }
  return room.state.players
    .map((player, index) =>
      isJoinableReplacementPlayer(room, player.id) ? index : -1,
    )
    .filter((index) => index >= 0);
}

function countHumanSeats(room: ServerRoom) {
  if (!room.state)
    return room.players.filter((player) => player.connected).length;
  return room.state.players.filter((player) => !player.isCpu).length;
}

function listPublicRooms(): OnlinePublicRoom[] {
  return Array.from(rooms.values())
    .filter((room) => {
      const settings = room.roomSettings;
      if (!settings || settings.visibility !== "public") return false;
      if (room.started) {
        return getJoinableReplacementSeatIndexes(room).length > 0;
      }
      if (settings.humanPlayers <= 1) return false;
      return room.players.length < settings.humanPlayers;
    })
    .sort((left, right) => left.createdAt - right.createdAt)
    .map((room) => {
      const settings = room.roomSettings!;
      return {
        roomId: room.id,
        roomName: settings.roomName,
        totalPlayers: settings.totalPlayers,
        humanPlayers: settings.humanPlayers,
        joinedHumanPlayers: room.started
          ? countHumanSeats(room)
          : room.players.length,
        cpuPlayers: settings.cpuPlayers,
        cpuModelIds: settings.cpuModelIds.slice(0, settings.cpuPlayers),
        allowMidGameJoin: Boolean(settings.allowMidGameJoin),
        started: room.started,
        currentRound: room.matchState?.currentRound,
        availableReplacementSeats:
          getJoinableReplacementSeatIndexes(room).length,
        matchType: settings.matchType,
        roundCount: settings.roundCount,
        targetScore: settings.targetScore,
        initialPoints: settings.initialPoints,
        daifugoOptions: settings.daifugoOptions,
        createdAt: room.createdAt,
      };
    });
}

function broadcastPublicRooms() {
  io.emit("publicRoomsUpdated", listPublicRooms());
}

function getSocketRoom(socket: OnlineSocket): ServerRoom | null {
  const roomId = socket.data.roomId;
  return roomId ? (rooms.get(roomId) ?? null) : null;
}

function createPlayerViewPayload(
  room: ServerRoom,
  playerId: string,
): OnlinePlayerViewPayload {
  const playerViewState = room.state
    ? createPlayerViewState(room.state, playerId)
    : null;
  return {
    room: snapshotRoom(room),
    playerId,
    state: playerViewState,
    matchState:
      room.matchState && playerViewState
        ? { ...room.matchState, gameState: playerViewState }
        : null,
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
  broadcastPublicRooms();
}

function clearTemporaryLeaveTimeouts(room: ServerRoom) {
  for (const leave of room.temporaryLeaves.values()) {
    if (leave.timeoutId) clearTimeout(leave.timeoutId);
  }
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function getCurrentHighestMatchScore(matchState: MatchState) {
  if (matchState.matchMode !== "targetScore") return 0;
  return Math.max(0, ...matchState.cumulativeScores);
}

function getTemporaryLeaveForPlayer(room: ServerRoom, playerId: string) {
  return room.temporaryLeaves.get(playerId) ?? null;
}

function getActiveCpuControlledPlayerModels(room: ServerRoom) {
  const playerModels = new Map<string, CpuModelId>();
  for (const leave of room.temporaryLeaves.values()) {
    if (leave.mode === "cpuSubstitute" || leave.convertedToCpu) {
      playerModels.set(
        leave.playerId,
        room.substituteCpuModelIds.get(leave.playerId) ?? "standard",
      );
    }
  }
  return playerModels;
}

function isPausedCurrentPlayer(room: ServerRoom) {
  if (!room.state) return false;
  const currentPlayer = room.state.players[room.state.currentPlayerIndex];
  if (!currentPlayer) return false;
  const leave = getTemporaryLeaveForPlayer(room, currentPlayer.id);
  return Boolean(leave && leave.mode === "pause" && !leave.convertedToCpu);
}

function convertTemporaryLeaveToCpu(room: ServerRoom, playerId: string) {
  const leave = room.temporaryLeaves.get(playerId);
  if (!leave || leave.convertedToCpu) return;
  if (leave.timeoutId) clearTimeout(leave.timeoutId);
  leave.convertedToCpu = true;
  room.temporaryLeaves.set(playerId, leave);
  replacePlayerSeatWithCpu(room, playerId);
  if (!hasHumanPlayerSeat(room)) {
    closeWaitingRoom(room);
    return;
  }
  broadcastPlayerView(room);
  scheduleRoomCpu(room);
}

function replacePlayerSeatWithCpu(room: ServerRoom, playerId: string) {
  if (!room.state) return false;
  const playerIndex = room.state.players.findIndex(
    (player) => player.id === playerId,
  );
  if (playerIndex < 0) return false;
  const cpuModelId = room.substituteCpuModelIds.get(playerId) ?? "standard";
  const cpuName = formatCpuModelName(cpuModelId);
  const nextPlayers = room.state.players.map((player, index) =>
    index === playerIndex
      ? {
          ...player,
          name: cpuName,
          type: "cpu" as const,
          isCpu: true,
          cpuModelId,
          joinableReplacement: Boolean(
            room.roomSettings?.allowMidGameJoin &&
            !room.temporaryLeaves.has(playerId),
          ),
        }
      : player,
  );
  room.state = { ...room.state, players: nextPlayers };
  room.matchState = syncMatchGameState(room.matchState, room.state);
  room.players = room.players.map((player) =>
    player.playerId === playerId ? { ...player, connected: false } : player,
  );
  if (room.hostPlayerId === playerId) {
    const nextHost = findNextHumanHostCandidate(room, playerId);
    if (nextHost) room.hostPlayerId = nextHost.playerId;
  }
  return true;
}

function isHumanHostCandidate(
  room: ServerRoom,
  playerId: string,
  excludedPlayerId?: string,
  connectedOnly = false,
) {
  if (playerId === excludedPlayerId) return false;
  const roomPlayer = room.players.find(
    (player) => player.playerId === playerId,
  );
  if (!roomPlayer) return false;
  if (connectedOnly && !roomPlayer.connected) return false;
  const gamePlayer = room.state?.players.find((item) => item.id === playerId);
  return Boolean(gamePlayer && !gamePlayer.isCpu);
}

function findConnectedHumanHostCandidate(
  room: ServerRoom,
  excludedPlayerId?: string,
) {
  return room.players.find((player) =>
    isHumanHostCandidate(room, player.playerId, excludedPlayerId, true),
  );
}

function findNextHumanHostCandidate(
  room: ServerRoom,
  excludedPlayerId?: string,
) {
  return (
    findConnectedHumanHostCandidate(room, excludedPlayerId) ??
    room.players.find((player) =>
      isHumanHostCandidate(room, player.playerId, excludedPlayerId),
    )
  );
}

function getConnectedHumanHostCandidates(
  room: ServerRoom,
  excludedPlayerId?: string,
) {
  return room.players.filter((player) =>
    isHumanHostCandidate(room, player.playerId, excludedPlayerId, true),
  );
}

function getRandomHumanHostCandidate(
  room: ServerRoom,
  excludedPlayerId?: string,
) {
  const connectedCandidates = getConnectedHumanHostCandidates(
    room,
    excludedPlayerId,
  );
  const candidates =
    connectedCandidates.length > 0
      ? connectedCandidates
      : room.players.filter((player) =>
          isHumanHostCandidate(room, player.playerId, excludedPlayerId),
        );
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function hasHumanPlayerSeat(room: ServerRoom) {
  return Boolean(room.state?.players.some((player) => !player.isCpu));
}

function formatCpuModelName(cpuModelId: CpuModelId) {
  if (cpuModelId === "easy") return "junior-CPU";
  if (cpuModelId === "tactical") return "pro-CPU";
  if (cpuModelId === "master") return "master-CPU";
  return "standard-CPU";
}

function isValidCpuModelId(value: unknown): value is CpuModelId {
  return (
    value === "easy" ||
    value === "standard" ||
    value === "tactical" ||
    value === "master"
  );
}

function createResumableGameSummary(
  room: ServerRoom,
  leave: TemporaryLeaveState,
): ResumableGameSummary {
  return {
    roomId: room.id,
    roomName:
      room.matchState?.roomName ?? room.roomSettings?.roomName ?? room.id,
    playerId: leave.playerId,
    playerName:
      room.state?.players[leave.playerIndex]?.name ??
      room.players.find((player) => player.playerId === leave.playerId)?.name ??
      leave.playerId,
    resumeToken: leave.resumeToken,
    mode: leave.mode,
    expiresAt: leave.expiresAt,
    currentRound: room.matchState?.currentRound ?? 1,
    matchType:
      room.matchState?.matchMode ?? room.roomSettings?.matchType ?? "rounds",
    totalPlayers:
      room.state?.players.length ??
      room.roomSettings?.totalPlayers ??
      room.maxPlayers,
    convertedToCpu: leave.convertedToCpu,
  };
}

function findResumableGames(entries: ResumableGameEntry[]) {
  const now = Date.now();
  const summaries: ResumableGameSummary[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const key = `${entry.roomId}:${entry.playerId}:${entry.resumeToken}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const room = rooms.get(entry.roomId);
    const leave = room?.temporaryLeaves.get(entry.playerId);
    if (!room || !leave) continue;
    if (leave.resumeToken !== entry.resumeToken) continue;
    if (leave.expiresAt <= now || leave.convertedToCpu) continue;
    summaries.push(createResumableGameSummary(room, leave));
  }
  return summaries;
}

function closeWaitingRoom(room: ServerRoom, exceptSocketId?: string) {
  cancelOnlineCpu(room.id);
  clearTemporaryLeaveTimeouts(room);
  for (const socketId of room.socketsByPlayerId.values()) {
    if (socketId === exceptSocketId) continue;
    const roomSocket = io.sockets.sockets.get(socketId) as
      | OnlineSocket
      | undefined;
    if (!roomSocket) continue;
    roomSocket.emit("roomClosed");
    roomSocket.leave(room.id);
    roomSocket.data.roomId = undefined;
    roomSocket.data.playerId = undefined;
  }
  rooms.delete(room.id);
  broadcastPublicRooms();
}

function removeWaitingPlayer(
  socket: OnlineSocket,
  room: ServerRoom,
  playerId: string,
) {
  room.socketsByPlayerId.delete(playerId);
  room.players = room.players.filter((player) => player.playerId !== playerId);
  socket.leave(room.id);
  socket.data.roomId = undefined;
  socket.data.playerId = undefined;
  const hostStillPresent = room.players.some(
    (player) =>
      player.playerId === room.hostPlayerId &&
      room.socketsByPlayerId.has(player.playerId),
  );
  if (!hostStillPresent) {
    closeWaitingRoom(room);
    return;
  }
  broadcastPlayerView(room);
}

function resolveHostTransferPlayerId(
  room: ServerRoom,
  exitingPlayerId: string,
  payload?: LeaveRoomPayload,
) {
  if (room.hostPlayerId !== exitingPlayerId) return undefined;
  if (payload?.type !== "hostTransfer") {
    const nextHost = findNextHumanHostCandidate(room, exitingPlayerId);
    return nextHost?.playerId;
  }
  if (payload.strategy === "named") {
    const target = room.players.find(
      (player) => player.playerId === payload.targetPlayerId,
    );
    if (
      !target ||
      !isHumanHostCandidate(room, target.playerId, exitingPlayerId, true)
    ) {
      return null;
    }
    return target.playerId;
  }
  const randomTarget = getRandomHumanHostCandidate(room, exitingPlayerId);
  return randomTarget?.playerId;
}

function leaveCurrentRoom(socket: OnlineSocket, payload?: LeaveRoomPayload) {
  const room = getSocketRoom(socket);
  const playerId = socket.data.playerId;
  if (!room || !playerId) return;
  if (!room.started) {
    if (playerId === room.hostPlayerId) {
      closeWaitingRoom(room, socket.id);
      socket.leave(room.id);
      socket.data.roomId = undefined;
      socket.data.playerId = undefined;
      return;
    }
    removeWaitingPlayer(socket, room, playerId);
    return;
  }
  const hostTransferPlayerId = resolveHostTransferPlayerId(
    room,
    playerId,
    payload,
  );
  if (hostTransferPlayerId === null) {
    socket.emit("errorMessage", "Host transfer target was not found.");
    return;
  }
  if (hostTransferPlayerId) {
    room.hostPlayerId = hostTransferPlayerId;
  }
  const leave = room.temporaryLeaves.get(playerId);
  if (leave?.timeoutId) clearTimeout(leave.timeoutId);
  room.temporaryLeaves.delete(playerId);
  replacePlayerSeatWithCpu(room, playerId);
  room.socketsByPlayerId.delete(playerId);
  socket.leave(room.id);
  socket.data.roomId = undefined;
  socket.data.playerId = undefined;
  if (!hasHumanPlayerSeat(room)) {
    closeWaitingRoom(room, socket.id);
    return;
  }
  broadcastPlayerView(room);
  scheduleRoomCpu(room);
  broadcastPublicRooms();
}

function rejectAction(
  socket: OnlineSocket,
  room: ServerRoom | null,
  playerId: string | undefined,
  reason: ActionRejectedReason,
) {
  socket.emit("actionRejected", {
    reason,
    expectedStateVersion: room?.state ? room.stateVersion : null,
    playerView:
      room && playerId ? createPlayerViewPayload(room, playerId) : null,
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

function validatePendingEffectAction(
  state: GameState,
  playerIndex: number,
  action: GameAction,
): ActionRejectedReason | null {
  const pending = state.pendingDaifugoEffect;
  if (!pending) return "invalid_action_for_phase";
  if (!pendingEffectActions.has(action.type)) return "invalid_action_for_phase";
  if ("playerIndex" in pending && pending.playerIndex !== playerIndex) {
    if (
      !(
        pending.kind === "sevenExchange" &&
        action.type === "selectSevenExchangeCard" &&
        action.playerIndex === playerIndex
      )
    ) {
      return "not_your_reaction";
    }
  }

  if (action.type === "answerDaifugoEffect")
    return pending.kind === "confirm" ? null : "invalid_action_for_phase";
  if (action.type === "answerSevenEnhancement")
    return pending.kind === "sevenEnhancementConfirm"
      ? null
      : "invalid_action_for_phase";
  if (action.type === "finishSevenEnhancementSplash")
    return pending.kind === "sevenEnhancementSplash"
      ? null
      : "invalid_action_for_phase";
  if (action.type === "selectEnhancedSevenTarget") {
    if (pending.kind !== "sevenEnhancedTargetSelect")
      return "invalid_action_for_phase";
    return action.targetPlayerIndex !== pending.playerIndex &&
      Boolean(state.players[action.targetPlayerIndex])
      ? null
      : "invalid_seven_exchange_target";
  }
  if (action.type === "confirmEnhancedSevenTarget") {
    if (pending.kind !== "sevenEnhancedTargetSelect")
      return "invalid_action_for_phase";
    return pending.selectedTargetPlayerIndex !== undefined &&
      pending.selectedTargetPlayerIndex !== pending.playerIndex &&
      Boolean(state.players[pending.selectedTargetPlayerIndex])
      ? null
      : "invalid_seven_exchange_target";
  }
  if (action.type === "answerFiveEnhancement")
    return pending.kind === "fiveEnhancementConfirm"
      ? null
      : "invalid_action_for_phase";
  if (action.type === "finishFiveEnhancementSplash")
    return pending.kind === "fiveEnhancementSplash"
      ? null
      : "invalid_action_for_phase";
  if (action.type === "selectEnhancedFiveTarget") {
    if (pending.kind !== "fiveEnhancedTargetSelect")
      return "invalid_action_for_phase";
    const option = getEnhancedFiveTurnOptions(state, pending.playerIndex).find(
      (candidate) => candidate.playerIndex === action.targetPlayerIndex,
    );
    return option?.selectable ? null : "invalid_five_skip_target";
  }
  if (action.type === "confirmEnhancedFiveTarget") {
    if (pending.kind !== "fiveEnhancedTargetSelect")
      return "invalid_action_for_phase";
    return pending.selectedTargetPlayerIndex !== undefined &&
      Boolean(state.players[pending.selectedTargetPlayerIndex])
      ? null
      : "invalid_five_skip_target";
  }
  if (action.type === "drawForDaifugoEffect")
    return pending.kind === "effectDraw" ? null : "invalid_action_for_phase";
  if (action.type === "selectQueenVanishRank") {
    if (pending.kind !== "queenSelect") return "invalid_q_effect_phase";
    const option = getQueenVanishRankOptions(state).find(
      (candidate) => candidate.rank === action.rank,
    );
    return option?.selectable ? null : "q_rank_not_selectable";
  }
  if (action.type === "answerQueenWin")
    return pending.kind === "queenWinConfirm"
      ? null
      : "invalid_tsumo_candidate";
  if (action.type === "discardForDaifugoEffect") {
    if (pending.kind !== "extraDiscard") return "invalid_action_for_phase";
    const player = state.players[playerIndex];
    const discardCard =
      player?.hand.find((card) => card.id === action.cardId) ?? null;
    if (!discardCard) return "invalid_effect_discard_card";
    if (isCardJShielded(player, discardCard))
      return "shielded_card_cannot_exchange";
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
    if (
      playerIndex !== pending.playerIndex &&
      playerIndex !== pending.targetPlayerIndex
    )
      return "not_your_reaction";
    if (pending.selections[playerIndex]) return "invalid_seven_exchange_card";
    const player = state.players[playerIndex];
    const selected =
      player?.hand.find((card) => card.id === action.cardId) ?? null;
    if (!selected) return "invalid_seven_exchange_card";
    if (isCardJShielded(player, selected))
      return "shielded_card_cannot_exchange";
    const candidates = getSevenExchangeCandidateCards(
      player,
      playerIndex === pending.playerIndex,
    );
    if (!candidates.some((card) => card.id === action.cardId))
      return "invalid_seven_exchange_card";
    return null;
  }
  if (action.type === "selectJackSpecialEffect") {
    if (pending.kind !== "jackSelect") return "invalid_action_for_phase";
    return ["inspectHands", "jShield", "enhanceFiveOrSeven"].includes(
      action.effect,
    )
      ? null
      : "invalid_j_effect_choice";
  }
  if (action.type === "selectJackShieldRank") {
    if (pending.kind !== "jackShieldSelect") return "invalid_action_for_phase";
    return pending.selectableRanks.includes(action.rank)
      ? null
      : "invalid_j_shield_target";
  }
  if (action.type === "selectJackShieldRun") {
    if (pending.kind !== "jackShieldSelect") return "invalid_action_for_phase";
    return getJackShieldRunOptions(state.players[playerIndex]).some(
      (run) => run.key === action.key,
    )
      ? null
      : "invalid_j_shield_target";
  }
  if (action.type === "inspectJackCard") {
    if (pending.kind !== "jackInspect") return "invalid_action_for_phase";
    const targetPlayerIndex =
      pending.targetPlayerIndexes[pending.currentTargetOffset];
    if (targetPlayerIndex !== action.targetPlayerIndex)
      return "invalid_j_view_target";
    const targetPlayer = state.players[targetPlayerIndex];
    if (!targetPlayer?.hand.some((card) => card.id === action.cardId))
      return "invalid_j_view_target";
    if (pending.revealedCardIds[targetPlayerIndex])
      return "invalid_action_for_phase";
    return null;
  }
  if (action.type === "confirmJackInspectCard") {
    if (pending.kind !== "jackInspect") return "invalid_action_for_phase";
    const targetPlayerIndex =
      pending.targetPlayerIndexes[pending.currentTargetOffset];
    return targetPlayerIndex !== undefined &&
      Boolean(pending.revealedCardIds[targetPlayerIndex])
      ? null
      : "invalid_action_for_phase";
  }
  if (action.type === "answerReachContinue") {
    if (pending.kind !== "reachContinueConfirm")
      return "invalid_action_for_phase";
    return null;
  }
  return null;
}

function validateOnlineAction(
  room: ServerRoom,
  playerId: string,
  action: GameAction,
): ActionRejectedReason | null {
  if (!room.state || !room.started) return "room_not_playing";
  if (action.type === "start" || action.type === "restart")
    return "invalid_action_for_phase";
  const playerIndex = room.state.players.findIndex(
    (player) => player.id === playerId,
  );
  if (playerIndex < 0) return "room_not_playing";

  if (action.type === "answerRon") {
    if (room.state.phase !== "ronCheck" || !room.state.pendingRonResult)
      return "invalid_action_for_phase";
    const canAnswer =
      room.state.pendingRonResult.ronResults?.some(
        (item) => item.winnerIndex === playerIndex,
      ) ?? false;
    return canAnswer ? null : "not_your_reaction";
  }

  if (pendingEffectActions.has(action.type)) {
    return validatePendingEffectAction(room.state, playerIndex, action);
  }

  if (action.type === "confirmHandoff") {
    return room.state.phase === "handoff" && !room.state.pendingDaifugoEffect
      ? null
      : "invalid_action_for_phase";
  }

  if (room.state.currentPlayerIndex !== playerIndex) return "not_your_turn";

  if (action.type === "drawFromDeck") {
    if (room.state.phase !== "draw") return "invalid_action_for_phase";
    return null;
  }
  if (action.type === "takeDiscard") {
    if (room.state.phase !== "draw") return "invalid_action_for_phase";
    if (room.state.players[playerIndex]?.isReach)
      return "reach_player_cannot_call";
    if (!getAvailableDiscardSources(room.state).includes(action.ownerIndex))
      return "invalid_call_candidate";
    if (!action.meld) return "invalid_call_candidate";
    const legalOptions = getCallOptionsForSource(room.state, action.ownerIndex);
    const meldIds = action.meld
      .map((card) => card.id)
      .sort()
      .join("|");
    const isLegalMeld = legalOptions.some(
      (option) =>
        option
          .map((card) => card.id)
          .sort()
          .join("|") === meldIds,
    );
    return isLegalMeld ? null : "invalid_call_candidate";
  }
  if (action.type === "winWithDiscard") {
    if (room.state.phase !== "discard") return "invalid_action_for_phase";
    const legalOptions = getWinningDiscardOptions(room.state);
    return legalOptions.some(
      (option) => option.discardCard.id === action.discardCardId,
    )
      ? null
      : "invalid_tsumo_candidate";
  }
  if (action.type === "discardDrawnOnly") {
    if (room.state.phase !== "discard" || !room.state.drawnCard)
      return "invalid_action_for_phase";
    const player = room.state.players[playerIndex];
    if (!player.isReach) return "invalid_action_for_reach_phase";
    if (room.state.declaredReachThisTurn)
      return "invalid_action_for_reach_phase";
    if (getWinningDiscardOptions(room.state).length > 0)
      return "invalid_tsumo_candidate";
    return null;
  }
  if (action.type === "declareReach") {
    if (room.state.phase !== "discard" || room.state.drawnFrom !== "deck")
      return "invalid_action_for_phase";
    if (getWinningDiscardOptions(room.state).length > 0)
      return "tsumo_available_reach_not_allowed";
    const player = room.state.players[playerIndex];
    if (player.isReach) return "already_reached";
    if (player.hasCalled) return "cannot_reach_after_call";

    return canDeclareReachInCurrentState(room.state, playerIndex)
      ? null
      : "invalid_reach_candidate";
  }
  if (action.type === "answerReachAfterDiscard") {
    return room.state.phase === "reachConfirm"
      ? null
      : "invalid_action_for_phase";
  }
  if (action.type !== "discard") return "invalid_action_for_phase";
  if (room.state.phase !== "discard") return "invalid_action_for_phase";
  const player = room.state.players[playerIndex];
  if (!player.hand.some((card) => card.id === action.cardId))
    return "card_not_in_hand";
  if (player.isReach && !room.state.declaredReachThisTurn) {
    return action.cardId === room.state.drawnCard?.id
      ? "discard_drawn_only_required"
      : "reach_hand_locked";
  }
  if (
    player.isReach &&
    room.state.declaredReachThisTurn &&
    !canKeepReachAfterDiscard(room.state, playerIndex, action.cardId)
  ) {
    return "invalid_reach_discard";
  }

  return null;
}

function getOnlinePlayerBaseName(name: string | undefined): string {
  const trimmed = name?.trim();
  return trimmed || "Guest Player";
}

function formatAssignedPlayerName(
  playerNumber: number,
  name: string | undefined,
): string {
  return `Player${playerNumber}:${getOnlinePlayerBaseName(name)}`;
}

function shuffleOnlinePlayers(players: OnlineRoomPlayer[]): OnlineRoomPlayer[] {
  const shuffled = players.slice();
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }
  return shuffled;
}

function assignOnlineTurnOrder(room: ServerRoom) {
  room.players = shuffleOnlinePlayers(room.players).map((player, index) => ({
    ...player,
    name: formatAssignedPlayerName(index + 1, player.name),
  }));
}

function startRoomGame(room: ServerRoom) {
  const settings = room.roomSettings;
  const matchMode = settings?.matchType ?? "rounds";
  const ruleValue =
    matchMode === "targetScore"
      ? (settings?.targetScore ?? 3)
      : matchMode === "startingPoints"
        ? (settings?.initialPoints ?? 3)
        : (settings?.roundCount ?? 3);
  const totalPlayers = settings?.totalPlayers ?? room.players.length;
  const humanPlayers = settings?.humanPlayers ?? room.players.length;
  assignOnlineTurnOrder(room);
  room.stateVersion = 0;
  room.matchState = createMatchState(
    matchMode,
    totalPlayers,
    room.direction,
    ruleValue,
    settings?.roomName ?? room.id,
    humanPlayers,
    settings?.cpuModelId ?? "standard",
    settings?.daifugoOptions ?? createDefaultDaifugoOptions(),
    settings?.cpuModelIds ?? [],
    false,
    createRandomStartPlayerIndex(totalPlayers),
  );
  room.state = room.matchState.gameState;
  room.state = remapOnlinePlayers(room, room.state);
  room.state = applyOnlineScenario(room.state, room.scenario);
  room.state = { ...room.state, stateVersion: room.stateVersion };
  room.matchState = room.matchState
    ? { ...room.matchState, gameState: room.state }
    : null;
  room.started = true;
}

function applyOnlineNextState(room: ServerRoom, nextState: GameState) {
  room.stateVersion += 1;
  room.state = { ...nextState, stateVersion: room.stateVersion };
  room.matchState = syncMatchGameState(room.matchState, room.state);
}

function scheduleRoomCpu(room: ServerRoom) {
  if (isPausedCurrentPlayer(room)) {
    cancelOnlineCpu(room.id);
    return;
  }
  scheduleOnlineCpu(room, {
    applyNextState: applyOnlineNextState,
    broadcastPlayerView,
    getCpuControlledPlayerModels: getActiveCpuControlledPlayerModels,
  });
}

function remapOnlinePlayers(room: ServerRoom, state: GameState): GameState {
  return {
    ...state,
    stateVersion: room.stateVersion,
    players: state.players.map((player, index) => {
      if (!player.isCpu) {
        const onlinePlayer = room.players[index];
        if (!onlinePlayer && room.roomSettings?.allowMidGameJoin) {
          return {
            ...player,
            id: `replacement-${index + 1}`,
            name: formatCpuModelName("standard"),
            type: "cpu",
            isCpu: true,
            cpuModelId: "standard",
            joinableReplacement: true,
          };
        }
        return {
          ...player,
          id: onlinePlayer?.playerId ?? player.id,
          name: onlinePlayer?.name ?? player.name,
          type: "human",
          isCpu: false,
          joinableReplacement: undefined,
        };
      }
      return {
        ...player,
        id: `cpu-${index + 1}`,
        name: formatCpuModelName(player.cpuModelId ?? "standard"),
        type: "cpu",
        isCpu: true,
        joinableReplacement: false,
      };
    }),
  };
}

function joinStartedRoomReplacementSeat(
  socket: OnlineSocket,
  room: ServerRoom,
  playerName: string,
) {
  const seatIndex = getJoinableReplacementSeatIndexes(room)[0];
  if (seatIndex === undefined || !room.state) return null;
  const playerId = createPlayerId(room);
  const player: OnlineRoomPlayer = {
    playerId,
    name: formatAssignedPlayerName(seatIndex + 1, playerName),
    ready: true,
    connected: true,
  };
  room.players.push(player);
  room.socketsByPlayerId.set(playerId, socket.id);
  room.state = {
    ...room.state,
    players: room.state.players.map((statePlayer, index) =>
      index === seatIndex
        ? {
            ...statePlayer,
            id: playerId,
            name: player.name,
            type: "human",
            isCpu: false,
            cpuModelId: undefined,
            joinableReplacement: undefined,
          }
        : statePlayer,
    ),
  };
  room.matchState = syncMatchGameState(room.matchState, room.state);
  socket.data.roomId = room.id;
  socket.data.playerId = playerId;
  socket.join(room.id);
  return playerId;
}

io.on("connection", (socket) => {
  socket.emit("publicRoomsUpdated", listPublicRooms());

  socket.on("createRoom", (payload, ack) => {
    const roomId = createRoomId();
    const room: ServerRoom = {
      id: roomId,
      hostPlayerId: "player-1",
      maxPlayers: payload.roomSettings?.humanPlayers ?? payload.maxPlayers ?? 4,
      direction:
        payload.roomSettings?.turnDirection ?? payload.direction ?? "clockwise",
      players: [],
      socketsByPlayerId: new Map(),
      state: null,
      matchState: null,
      stateVersion: 0,
      started: false,
      scenario: payload.scenario,
      createdAt: Date.now(),
      roomSettings: payload.roomSettings,
      nextPlayerNumber: 1,
      temporaryLeaves: new Map(),
      substituteCpuModelIds: new Map(),
    };
    const player: OnlineRoomPlayer = {
      playerId: createPlayerId(room),
      name: getOnlinePlayerBaseName(payload.playerName),
      ready: false,
      connected: true,
    };
    room.players.push(player);
    room.socketsByPlayerId.set(player.playerId, socket.id);
    rooms.set(roomId, room);
    socket.data.roomId = roomId;
    socket.data.playerId = player.playerId;
    socket.join(roomId);
    ack({
      ok: true,
      roomId,
      playerId: player.playerId,
      room: snapshotRoom(room),
      state: null,
    });
    broadcastPlayerView(room);
    broadcastPublicRooms();
  });

  socket.on("listPublicRooms", (ack) => {
    ack(listPublicRooms());
  });

  socket.on("listResumableGames", (payload, ack) => {
    ack(findResumableGames(payload.entries ?? []));
  });

  socket.on("leaveRoom", (payload) => {
    leaveCurrentRoom(socket, payload);
  });

  socket.on("transferHost", (payload) => {
    const room = getSocketRoom(socket);
    const playerId = socket.data.playerId;
    if (!room || !playerId) return;
    if (room.hostPlayerId !== playerId) {
      socket.emit("errorMessage", "Only the host can change the host.");
      return;
    }
    const target = room.players.find(
      (player) => player.playerId === payload.targetPlayerId,
    );
    if (!target) {
      socket.emit("errorMessage", "Host target was not found.");
      return;
    }
    if (target.playerId === room.hostPlayerId) {
      socket.emit("errorMessage", "That player is already the host.");
      return;
    }
    if (!target.connected) {
      socket.emit("errorMessage", "Disconnected players cannot become host.");
      return;
    }
    if (target.playerId.startsWith("cpu-")) {
      socket.emit("errorMessage", "CPU players cannot become host.");
      return;
    }

    room.hostPlayerId = target.playerId;
    broadcastPlayerView(room);
  });

  socket.on("updateMatchSettings", (payload) => {
    const room = getSocketRoom(socket);
    const playerId = socket.data.playerId;
    if (!room || !playerId) return;
    if (!payload || typeof payload !== "object") {
      socket.emit("errorMessage", "Invalid match settings payload.");
      return;
    }
    const matchType = (payload as { matchType?: unknown }).matchType;
    if (matchType !== "rounds" && matchType !== "targetScore") {
      socket.emit(
        "errorMessage",
        "Match settings cannot be changed for this match type.",
      );
      return;
    }
    if (!room.started || !room.matchState) {
      socket.emit(
        "errorMessage",
        "Match settings can only be changed during a match.",
      );
      return;
    }
    if (room.hostPlayerId !== playerId) {
      socket.emit("errorMessage", "Only the host can change match settings.");
      return;
    }
    if (room.matchState.matchMode !== matchType) {
      socket.emit("errorMessage", "Match type does not match current room.");
      return;
    }

    if (matchType === "rounds") {
      const roundCount = (payload as { roundCount?: unknown }).roundCount;
      if (!isPositiveInteger(roundCount)) {
        socket.emit("errorMessage", "Round count must be a positive integer.");
        return;
      }
      if (roundCount <= room.matchState.currentRound) {
        socket.emit(
          "errorMessage",
          "Round count must be greater than the current round.",
        );
        return;
      }
      if (roundCount > MAX_ROUND_COUNT) {
        socket.emit("errorMessage", "Round count must be 100 or less.");
        return;
      }
      room.roomSettings = room.roomSettings
        ? { ...room.roomSettings, roundCount }
        : room.roomSettings;
      room.matchState = {
        ...room.matchState,
        totalRounds: roundCount,
        gameState: room.state ?? room.matchState.gameState,
      };
      broadcastPlayerView(room);
      return;
    }

    if (matchType === "targetScore") {
      const targetScore = (payload as { targetScore?: unknown }).targetScore;
      if (!isPositiveInteger(targetScore)) {
        socket.emit("errorMessage", "Target score must be a positive integer.");
        return;
      }
      if (targetScore < MIN_TARGET_SCORE || targetScore > MAX_TARGET_SCORE) {
        socket.emit(
          "errorMessage",
          "Target score must be between 50 and 10000.",
        );
        return;
      }
      if (targetScore <= getCurrentHighestMatchScore(room.matchState)) {
        socket.emit(
          "errorMessage",
          "Target score must be greater than the current highest score.",
        );
        return;
      }
      room.roomSettings = room.roomSettings
        ? { ...room.roomSettings, targetScore }
        : room.roomSettings;
      room.matchState = {
        ...room.matchState,
        targetScore,
        gameState: room.state ?? room.matchState.gameState,
      };
      broadcastPlayerView(room);
      return;
    }

    socket.emit(
      "errorMessage",
      "Match settings cannot be changed for this match type.",
    );
  });

  socket.on("updateSubstituteCpuModel", (payload) => {
    const room = getSocketRoom(socket);
    const playerId = socket.data.playerId;
    if (!room || !playerId || !room.started || !room.state) return;
    if (!isValidCpuModelId(payload.cpuModelId)) {
      socket.emit("errorMessage", "Invalid CPU model.");
      return;
    }
    const player = room.state.players.find((item) => item.id === playerId);
    if (!player || player.isCpu) {
      socket.emit(
        "errorMessage",
        "Only human players can change substitute CPU model.",
      );
      return;
    }
    room.substituteCpuModelIds.set(playerId, payload.cpuModelId);
    broadcastPlayerView(room);
    scheduleRoomCpu(room);
  });

  socket.on("startTemporaryLeave", (payload, ack) => {
    const room = getSocketRoom(socket);
    const playerId = socket.data.playerId;
    if (!room || !playerId || !room.started || !room.state) {
      ack({
        ok: false,
        error: "Temporary leave is only available during a match.",
      });
      return;
    }
    const mode = payload.mode;
    if (mode !== "pause" && mode !== "cpuSubstitute") {
      ack({ ok: false, error: "Invalid temporary leave mode." });
      return;
    }
    const playerIndex = room.state.players.findIndex(
      (player) => player.id === playerId,
    );
    const player = room.state.players[playerIndex];
    if (playerIndex < 0 || !player || player.isCpu) {
      ack({ ok: false, error: "Only human players can temporarily leave." });
      return;
    }
    if (room.temporaryLeaves.has(playerId)) {
      ack({ ok: false, error: "This player is already temporarily away." });
      return;
    }

    const startedAt = Date.now();
    const expiresAt = startedAt + TEMPORARY_LEAVE_LIMIT_MS;
    const resumeToken = randomUUID();
    if (!room.substituteCpuModelIds.has(playerId)) {
      room.substituteCpuModelIds.set(playerId, "standard");
    }
    const timeoutId = setTimeout(() => {
      convertTemporaryLeaveToCpu(room, playerId);
    }, TEMPORARY_LEAVE_LIMIT_MS);
    room.temporaryLeaves.set(playerId, {
      playerId,
      playerIndex,
      mode,
      startedAt,
      expiresAt,
      resumeToken,
      timeoutId,
      convertedToCpu: false,
    });
    room.socketsByPlayerId.delete(playerId);
    room.players = room.players.map((roomPlayer) =>
      roomPlayer.playerId === playerId
        ? { ...roomPlayer, connected: false }
        : roomPlayer,
    );
    socket.leave(room.id);
    socket.data.roomId = undefined;
    socket.data.playerId = undefined;
    ack({ ok: true, roomId: room.id, playerId, resumeToken, expiresAt });
    broadcastPlayerView(room);
    scheduleRoomCpu(room);
  });

  socket.on("resumeTemporaryLeave", (payload, ack) => {
    const room = rooms.get(payload.roomId);
    const leave = room?.temporaryLeaves.get(payload.playerId);
    if (!room || !leave || leave.resumeToken !== payload.resumeToken) {
      ack({ ok: false, error: "Resumable match was not found." });
      return;
    }
    if (leave.expiresAt <= Date.now() || leave.convertedToCpu) {
      ack({ ok: false, error: "Temporary leave has expired." });
      return;
    }
    if (leave.timeoutId) clearTimeout(leave.timeoutId);
    room.temporaryLeaves.delete(payload.playerId);
    room.socketsByPlayerId.set(payload.playerId, socket.id);
    room.players = room.players.map((player) =>
      player.playerId === payload.playerId
        ? { ...player, connected: true }
        : player,
    );
    socket.data.roomId = room.id;
    socket.data.playerId = payload.playerId;
    socket.join(room.id);
    ack({ ok: true });
    emitPlayerView(room, payload.playerId);
    broadcastPlayerView(room);
    scheduleRoomCpu(room);
  });

  socket.on("joinRoom", (payload, ack) => {
    const room = rooms.get(payload.roomId.trim().toUpperCase());
    if (!room) {
      ack({ ok: false, error: "Room not found." });
      return;
    }
    if (room.started) {
      const playerId = joinStartedRoomReplacementSeat(
        socket,
        room,
        payload.playerName,
      );
      if (!playerId) {
        ack({ ok: false, error: "Game has already started." });
        return;
      }
      if (!room.state) {
        ack({ ok: false, error: "Game has not started." });
        return;
      }
      ack({
        ok: true,
        roomId: room.id,
        playerId,
        room: snapshotRoom(room),
        state: createPlayerViewState(room.state, playerId),
      });
      emitPlayerView(room, playerId);
      broadcastPlayerView(room);
      scheduleRoomCpu(room);
      broadcastPublicRooms();
      return;
    }
    if (room.players.length >= room.maxPlayers) {
      ack({ ok: false, error: "Room is full." });
      return;
    }
    const player: OnlineRoomPlayer = {
      playerId: createPlayerId(room),
      name: getOnlinePlayerBaseName(payload.playerName),
      ready: false,
      connected: true,
    };
    room.players.push(player);
    room.socketsByPlayerId.set(player.playerId, socket.id);
    socket.data.roomId = room.id;
    socket.data.playerId = player.playerId;
    socket.join(room.id);
    ack({
      ok: true,
      roomId: room.id,
      playerId: player.playerId,
      room: snapshotRoom(room),
      state: null,
    });
    broadcastPlayerView(room);
  });

  socket.on("ready", (payload) => {
    const room = getSocketRoom(socket);
    const playerId = socket.data.playerId;
    if (!room || !playerId || room.started) return;
    room.players = room.players.map((player) =>
      player.playerId === playerId
        ? { ...player, ready: payload.ready }
        : player,
    );
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
    const totalSeats = room.roomSettings?.totalPlayers ?? room.maxPlayers;
    const allowMidGameJoin = Boolean(room.roomSettings?.allowMidGameJoin);
    const hasSoloCpuComposition =
      (room.roomSettings?.humanPlayers ?? room.maxPlayers) <= 1 &&
      (room.roomSettings?.cpuPlayers ?? 0) > 0;
    if (
      totalSeats < 2 ||
      (!allowMidGameJoin && room.players.length < room.maxPlayers) ||
      (allowMidGameJoin &&
        (room.players.length < 1 || hasSoloCpuComposition)) ||
      !room.players.every(
        (player) => player.ready || player.playerId === room.hostPlayerId,
      )
    ) {
      socket.emit(
        "errorMessage",
        "Need at least two players, and all guests must be ready.",
      );
      return;
    }
    startRoomGame(room);
    broadcastPlayerView(room);
    scheduleRoomCpu(room);
    broadcastPublicRooms();
  });

  socket.on("submitAction", (payload) => {
    const room = getSocketRoom(socket);
    const playerId = socket.data.playerId;
    if (!room || !playerId) return;
    if (!room.state || !room.started) {
      rejectAction(socket, room, playerId, "room_not_playing");
      return;
    }
    if (isPausedCurrentPlayer(room)) {
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
    const nextState = gameReducer(room.state, payload.action);
    if (nextState === room.state) {
      rejectAction(socket, room, playerId, "invalid_action_for_phase");
      return;
    }
    applyOnlineNextState(room, nextState);
    broadcastPlayerView(room);
    scheduleRoomCpu(room);
  });

  socket.on("nextRound", () => {
    const room = getSocketRoom(socket);
    const playerId = socket.data.playerId;
    if (!room || !playerId || !room.state || !room.started || !room.matchState)
      return;
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
    const nextMatch = advanceRound(
      syncedMatch,
      createRandomStartPlayerIndex(syncedMatch.playerCount),
    );
    room.stateVersion += 1;
    const nextGameState = remapOnlinePlayers(room, nextMatch.gameState);
    room.state = nextGameState;
    room.matchState = { ...nextMatch, gameState: nextGameState };
    broadcastPlayerView(room);
    scheduleRoomCpu(room);
  });

  socket.on("disconnect", () => {
    leaveCurrentRoom(socket);
  });
});

httpServer.listen(PORT, () => {
  console.info(`Local online server listening on http://localhost:${PORT}`);
});
