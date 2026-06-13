import dotenv from "dotenv";

dotenv.config();

const defaultCorsOrigins = "http://localhost:5173,http://localhost:8081,http://localhost:19006";
const rawCorsOrigins = process.env.CORS_ORIGINS ?? process.env.CORS_ORIGIN ?? defaultCorsOrigins;

function parseCorsOrigins(value) {
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function validateEnv() {
  const nodeEnv = process.env.NODE_ENV ?? "development";

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL zorunludur");
  }

  if (nodeEnv === "production" && (!process.env.JWT_SECRET || process.env.JWT_SECRET === "change-this-secret")) {
    throw new Error("Production ortamında JWT_SECRET güçlü bir değer olarak ayarlanmalıdır");
  }
}

validateEnv();

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET ?? "development-secret",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "1d",
  corsOrigins: parseCorsOrigins(rawCorsOrigins)
};
