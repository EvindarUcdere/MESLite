import dotenv from "dotenv";

dotenv.config();

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET ?? "development-secret",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "1d",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173"
};
