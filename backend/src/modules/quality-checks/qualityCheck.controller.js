import * as qualityCheckService from "./qualityCheck.service.js";
import { getClientContextFromRequest, runIdempotentOperation } from "../offline-operations/offlineOperation.service.js";

export async function list(_req, res) {
  const checks = await qualityCheckService.findQualityChecks();
  res.json({ data: checks });
}

export async function detail(req, res) {
  const check = await qualityCheckService.findQualityCheckById(req.params.id);
  res.json({ data: check });
}

export async function create(req, res) {
  const { operationId, ...payload } = req.validated.body;
  const result = await runIdempotentOperation({
    operationId,
    type: "QUALITY_CHECK",
    user: req.user,
    workOrderId: payload.workOrderId,
    payload,
    clientContext: getClientContextFromRequest(req),
    handler: () => qualityCheckService.createQualityCheck(req.user, payload)
  });

  res.status(result.idempotent ? 200 : 201).json({ data: result.data, idempotent: result.idempotent });
}

export async function update(req, res) {
  const check = await qualityCheckService.updateQualityCheck(req.user, req.params.id, req.validated.body);
  res.json({ data: check });
}
