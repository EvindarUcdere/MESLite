import { useEffect, useRef } from "react";
import { io } from "socket.io-client";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";
const SOCKET_URL = API_URL.replace(/\/api\/?$/, "");

export function useSocket(eventHandlers = {}) {
  const handlersRef = useRef(eventHandlers);

  useEffect(() => {
    handlersRef.current = eventHandlers;
  }, [eventHandlers]);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ["websocket"]
    });

    socket.emit("join:dashboard");

    Object.keys(eventHandlers).forEach((eventName) => {
      socket.on(eventName, (...args) => {
        handlersRef.current[eventName]?.(...args);
      });
    });

    return () => {
      socket.emit("leave:dashboard");
      socket.disconnect();
    };
  }, []);
}
