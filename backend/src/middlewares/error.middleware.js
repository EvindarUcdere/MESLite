import { env } from "../config/env.js";

export function notFoundHandler(req, _res, next) {
  const error = new Error(`Rota bulunamadı: ${req.method} ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
}

export function errorHandler(error, _req, res, _next) {
  const statusCode = error.statusCode ?? 500;

  res.status(statusCode).json({
    message: error.message ?? "Sunucu hatası",
    ...(env.nodeEnv === "development" ? { stack: error.stack } : {})
  });
}
