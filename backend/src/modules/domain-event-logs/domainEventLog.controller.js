import * as domainEventLogService from "./domainEventLog.service.js";

export async function list(req, res) {
  const logs = await domainEventLogService.findDomainEventLogs({
    limit: req.query.limit,
    type: req.query.type,
    entityType: req.query.entityType,
    entityId: req.query.entityId
  });

  res.json({ data: logs });
}
