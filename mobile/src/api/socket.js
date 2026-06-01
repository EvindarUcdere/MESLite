import { io } from "socket.io-client";
import { getApiBaseUrl } from "./client";

export function createMobileSocket() {
  const socketUrl = getApiBaseUrl().replace(/\/api\/?$/, "");

  return io(socketUrl, {
    transports: ["websocket"]
  });
}
