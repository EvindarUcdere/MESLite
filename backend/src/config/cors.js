import { env } from "./env.js";

function isLocalDevelopmentOrigin(origin) {
  return env.nodeEnv === "development" && /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
}

export function isAllowedOrigin(origin) {
  return !origin || env.corsOrigins.includes(origin) || isLocalDevelopmentOrigin(origin);
}

export const corsOptions = {
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS origin not allowed: ${origin}`));
  },
  credentials: true
};
