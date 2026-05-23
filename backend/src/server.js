import http from "node:http";
import { Server } from "socket.io";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { initSocket } from "./config/socket.js";

const app = createApp();
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: env.corsOrigin,
    credentials: true
  }
});

initSocket(io);

io.on("connection", (socket) => {
  socket.on("join:dashboard", () => socket.join("dashboard"));
  socket.on("leave:dashboard", () => socket.leave("dashboard"));
});

httpServer.listen(env.port, () => {
  console.log(`MES Lite API running on http://localhost:${env.port}`);
});
