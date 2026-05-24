import dotenv from "dotenv";

dotenv.config();

const defaultCorsOrigins = "http://localhost:5173,http://localhost:8081,http://localhost:19006";

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET ?? "development-secret",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "1d",
  corsOrigins: (process.env.CORS_ORIGIN ?? defaultCorsOrigins).split(",").map((origin) => origin.trim())
};
