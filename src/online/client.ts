import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "./types";

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

export function getOnlineSocket() {
  if (!socket) {
    const serverUrl =
      import.meta.env.VITE_ONLINE_SERVER_URL ??
      `${window.location.protocol}//${window.location.hostname}:3001`;

    socket = io(serverUrl, {
      autoConnect: false,
    });
  }

  return socket;
}
