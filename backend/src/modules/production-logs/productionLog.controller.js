import * as productionLogService from "./productionLog.service.js";
import { getClientContextFromRequest, runIdempotentOperation } from "../offline-operations/offlineOperation.service.js";

export async function list(_req, res) {
  const logs = await productionLogService.findProductionLogs();
  res.json({ data: logs });
}

export async function detail(req, res) {
  const log = await productionLogService.findProductionLogById(req.params.id);
  res.json({ data: log });
}

export async function create(req, res) {
  const { operationId, ...payload } = req.validated.body;
  const result = await runIdempotentOperation({
    operationId,
    type: "PRODUCTION_LOG",
    user: req.user,
    workOrderId: payload.workOrderId,
    payload,
    clientContext: getClientContextFromRequest(req),
    handler: () => productionLogService.createProductionLog(req.user, payload)
  });

  res.status(result.idempotent ? 200 : 201).json({ data: result.data, idempotent: result.idempotent });
}

export async function createScrapAction(req, res) {
  const { operationId, ...payload } = req.validated.body;
  const result = await runIdempotentOperation({
    operationId,
    type: "SCRAP_ACTION",
    user: req.user,
    payload: { productionLogId: req.params.id, ...payload },
    clientContext: getClientContextFromRequest(req),
    handler: () => productionLogService.createScrapActionForProductionLog(req.user, req.params.id, payload)
  });

  res.status(result.idempotent ? 200 : 201).json({ data: result.data, idempotent: result.idempotent });
}

export async function addAttachment(req, res) {
  const attachment = await productionLogService.addProductionLogAttachment(req.user, req.params.id, req.file);
  res.status(201).json({ data: attachment });
}

export async function update(req, res) {
  const log = await productionLogService.updateProductionLog(req.user, req.params.id, req.validated.body);
  res.json({ data: log });
}
