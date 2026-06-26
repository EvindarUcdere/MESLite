import http from "node:http";
import { Server } from "socket.io";
import { createApp } from "./app.js";
import { corsOptions } from "./config/cors.js";
import { env } from "./config/env.js";
import { initSocket } from "./config/socket.js";
import { registerDomainEventHandlers } from "./events/registerDomainEventHandlers.js";
import { startEdgeSyncWorker } from "./modules/edge-sync/edgeSync.service.js";
import { notifyShiftStartWorkOrders } from "./modules/work-orders/workOrder.service.js";

const app = createApp();
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: corsOptions
});

initSocket(io);
registerDomainEventHandlers();
startEdgeSyncWorker();

io.on("connection", (socket) => {
  socket.on("join:dashboard", () => socket.join("dashboard"));
  socket.on("leave:dashboard", () => socket.leave("dashboard"));
});

async function runShiftStartNotificationJob() {
  try {
    const result = await notifyShiftStartWorkOrders();
    if (result.created > 0) {
      console.log(`[shift-start-job] ${result.created} vardiya başlangıç bildirimi oluşturuldu.`);
    }
  } catch (error) {
    console.error("[shift-start-job] Vardiya başlangıç bildirimi kontrolü başarısız:", error);
  }
}

setTimeout(runShiftStartNotificationJob, 5000);
setInterval(runShiftStartNotificationJob, 60 * 1000);

httpServer.listen(env.port, () => {
  console.log(`MES Lite API running on http://localhost:${env.port}`);
});
