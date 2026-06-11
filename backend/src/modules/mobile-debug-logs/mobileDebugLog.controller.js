import * as mobileDebugLogService from "./mobileDebugLog.service.js";

export async function create(req, res) {
  const log = await mobileDebugLogService.createMobileDebugLog(req.user.id, req.validated.body);

  res.status(201).json({ data: log });
}

export async function list(req, res) {
  const canViewAll = ["ADMIN", "PRODUCTION_MANAGER"].includes(req.user.role);
  const logs = await mobileDebugLogService.findMobileDebugLogs({
    userId: canViewAll ? req.query.userId : req.user.id,
    limit: Number(req.query.limit || 100)
  });

  res.json({ data: logs });
}
