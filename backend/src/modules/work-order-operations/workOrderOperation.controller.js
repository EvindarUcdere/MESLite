import * as workOrderOperationService from "./workOrderOperation.service.js";
import { runIdempotentOperation } from "../offline-operations/offlineOperation.service.js";

export async function list(_req, res) {
  const operations = await workOrderOperationService.findWorkOrderOperations();
  res.json({ data: operations });
}

export async function my(req, res) {
  const operations = await workOrderOperationService.findAssignedOperations(req.user.id);
  res.json({ data: operations });
}

export async function start(req, res) {
  const result = await runIdempotentOperation({
    operationId: req.body?.operationId,
    type: "OPERATION_START",
    user: req.user,
    payload: { workOrderOperationId: req.params.id },
    handler: () => workOrderOperationService.startOperation(req.user, req.params.id)
  });
  res.json({ data: result.data, idempotent: result.idempotent });
}

export async function pause(req, res) {
  const { operationId, ...payload } = req.validated.body;
  const result = await runIdempotentOperation({
    operationId,
    type: "OPERATION_PAUSE",
    user: req.user,
    payload: { workOrderOperationId: req.params.id, ...payload },
    handler: () => workOrderOperationService.pauseOperation(req.user, req.params.id, payload)
  });
  res.json({ data: result.data, idempotent: result.idempotent });
}

export async function complete(req, res) {
  const result = await runIdempotentOperation({
    operationId: req.body?.operationId,
    type: "OPERATION_COMPLETE",
    user: req.user,
    payload: { workOrderOperationId: req.params.id },
    handler: () => workOrderOperationService.completeOperation(req.user, req.params.id)
  });
  res.json({ data: result.data, idempotent: result.idempotent });
}

export async function createMessage(req, res) {
  const { operationId, ...payload } = req.validated.body;
  const result = await runIdempotentOperation({
    operationId,
    type: "OPERATION_MESSAGE",
    user: req.user,
    payload: { workOrderOperationId: req.params.id, ...payload },
    handler: () => workOrderOperationService.createOperationMessage(req.user, req.params.id, payload)
  });
  res.status(result.idempotent ? 200 : 201).json({ data: result.data, idempotent: result.idempotent });
}
