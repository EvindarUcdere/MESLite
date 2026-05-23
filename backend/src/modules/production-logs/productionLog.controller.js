import * as productionLogService from "./productionLog.service.js";

export async function list(_req, res) {
  const logs = await productionLogService.findProductionLogs();
  res.json({ data: logs });
}

export async function detail(req, res) {
  const log = await productionLogService.findProductionLogById(req.params.id);
  res.json({ data: log });
}

export async function create(req, res) {
  const log = await productionLogService.createProductionLog(req.user, req.validated.body);
  res.status(201).json({ data: log });
}

export async function update(req, res) {
  const log = await productionLogService.updateProductionLog(req.params.id, req.validated.body);
  res.json({ data: log });
}
