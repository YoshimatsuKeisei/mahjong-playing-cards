import { createServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { createDefaultDaifugoOptions } from "../src/game/deck";
import { createInitialGame, gameReducer, type GameAction } from "../src/game/gameState";
import { createPlayerViewState } from "../src/online/playerView";
import type { ClientToServerEvents, OnlineRoomPlayer, OnlineRoomSnapshot, ServerToClientEvents } from "../src/online/types";
import type { Direction, GameState } from "../src/types";

interface ServerRoom {
  id: string;
  hostPlayerId: string;
  maxPlayers: number;
  direction: Direction;
  players: OnlineRoomPlayer[];
  socketsByPlayerId: Map<string, string>;
  state: GameState | null;
  started: boolean;
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

function emitPlayerView(room: ServerRoom, playerId: string) {
  const socketId = room.socketsByPlayerId.get(playerId);
  if (!socketId) return;
  io.to(socketId).emit("playerView", {
    room: snapshotRoom(room),
    playerId,
    state: room.state ? createPlayerViewState(room.state, playerId) : null,
  });
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

function canSubmitAction(room: ServerRoom, playerId: string, action: GameAction): boolean {
  if (!room.state) return false;
  if (action.type === "start" || action.type === "restart") return false;
  const playerIndex = room.state.players.findIndex((player) => player.id === playerId);
  if (playerIndex < 0) return false;
  if (action.type === "confirmHandoff") return true;
  if (action.type === "answerRon") {
    return room.state.pendingRonResult?.ronResults?.some((ron) => ron.winnerIndex === playerIndex) ?? false;
  }
  if (action.type === "selectSevenExchangeCard") return action.playerIndex === playerIndex;
  const pending = room.state.pendingDaifugoEffect;
  if (pending && "playerIndex" in pending && pending.playerIndex === playerIndex) return true;
  return room.state.currentPlayerIndex === playerIndex;
}

function startRoomGame(room: ServerRoom) {
  room.state = createInitialGame(
    room.players.length,
    room.direction,
    room.players.length,
    "standard",
    createDefaultDaifugoOptions(),
    [],
    false,
  );
  room.state = {
    ...room.state,
    players: room.state.players.map((player, index) => ({
      ...player,
      id: room.players[index].playerId,
      name: room.players[index].name,
      type: "human",
      isCpu: false,
    })),
  };
  room.started = true;
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
      started: false,
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

  socket.on("submitAction", (action) => {
    const room = getSocketRoom(socket);
    const playerId = socket.data.playerId;
    if (!room || !playerId || !room.state) return;
    if (!canSubmitAction(room, playerId, action)) {
      socket.emit("errorMessage", "It is not your turn for that action.");
      return;
    }
    const nextState = gameReducer(room.state, action);
    room.state = nextState;
    broadcastPlayerView(room);
  });

  socket.on("disconnect", () => {
    leaveCurrentRoom(socket);
  });
});

httpServer.listen(PORT, () => {
  console.info(`Local online server listening on http://localhost:${PORT}`);
});
