import dotenv from "dotenv";

dotenv.config();

const defaultCorsOrigins = "http://localhost:5173,http://localhost:8081,http://localhost:19006";
const rawCorsOrigins = process.env.CORS_ORIGINS ?? process.env.CORS_ORIGIN ?? defaultCorsOrigins;
const edgeMode = process.env.EDGE_MODE === "true";

function parseCorsOrigins(value) {
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function validateEnv() {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const jwtSecret = process.env.JWT_SECRET;
  const weakJwtSecrets = new Set(["change-this-secret", "development-secret", "secret", "meslite-secret"]);

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL zorunludur");
  }

  if (nodeEnv === "production" && (!jwtSecret || jwtSecret.length < 32 || weakJwtSecrets.has(jwtSecret.toLowerCase()))) {
    throw new Error("Production ortamında JWT_SECRET en az 32 karakterlik güçlü ve benzersiz bir değer olmalıdır");
  }

  if (edgeMode && process.env.EDGE_CLOUD_API_URL && !process.env.EDGE_SYNC_SECRET) {
    throw new Error("EDGE_MODE cloud sync icin EDGE_SYNC_SECRET gerekir");
  }
}

validateEnv();

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET ?? "development-secret",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "1d",
  corsOrigins: parseCorsOrigins(rawCorsOrigins),
  edgeMode,
  edgeCloudApiUrl: process.env.EDGE_CLOUD_API_URL,
  edgeSyncSecret: process.env.EDGE_SYNC_SECRET,
  edgeSyncIntervalMs: Number(process.env.EDGE_SYNC_INTERVAL_MS ?? 30000)
};
