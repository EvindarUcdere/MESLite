import { io } from "socket.io-client";
import { getApiBaseUrl } from "./client";

export function createMobileSocket() {
  const socketUrl = getApiBaseUrl().replace(/\/api\/?$/, "");

  return io(socketUrl, {
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000
  });
}
