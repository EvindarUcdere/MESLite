import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { mountSwagger } from "./config/swagger.js";
import { errorHandler, notFoundHandler } from "./middlewares/error.middleware.js";
import { apiRoutes } from "./routes/index.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.corsOrigin, credentials: true }));
  app.use(express.json());
  app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "mes-lite-api" });
  });

  mountSwagger(app);
  app.use("/api", apiRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
