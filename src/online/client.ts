import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "./types";

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

export function getOnlineSocket() {
  if (!socket) {
    socket = io(import.meta.env.VITE_ONLINE_SERVER_URL ?? "http://localhost:3001", {
      autoConnect: false,
    });
  }
  return socket;
}
