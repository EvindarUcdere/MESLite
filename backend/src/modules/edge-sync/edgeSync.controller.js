import { env } from "../../config/env.js";
import { ApiError } from "../../utils/ApiError.js";
import { applyEdgeOperation } from "./edgeSync.service.js";

export async function receiveOperation(req, res) {
  if (!env.edgeSyncSecret || req.headers["x-edge-sync-secret"] !== env.edgeSyncSecret) {
    throw new ApiError(401, "Invalid edge sync secret");
  }

  const result = await applyEdgeOperation(req.body);
  res.status(result.idempotent ? 200 : 201).json({ data: result.data, idempotent: result.idempotent });
}
