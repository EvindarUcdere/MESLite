import { findOfflineOperationLogs } from "./offlineOperation.service.js";

export async function list(req, res) {
  const logs = await findOfflineOperationLogs({
    limit: req.query.limit,
    status: req.query.status,
    type: req.query.type,
    userId: req.query.userId,
    workOrderId: req.query.workOrderId
  });

  res.json({ data: logs });
}
