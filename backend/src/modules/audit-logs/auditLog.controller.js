import * as auditLogService from "./auditLog.service.js";

export async function list(req, res) {
  const logs = await auditLogService.findAuditLogs({
    limit: req.query.limit,
    entityType: req.query.entityType,
    entityId: req.query.entityId,
    actorId: req.query.actorId
  });

  res.json({ data: logs });
}
