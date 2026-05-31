import * as workOrderOperationService from "./workOrderOperation.service.js";

export async function list(_req, res) {
  const operations = await workOrderOperationService.findWorkOrderOperations();
  res.json({ data: operations });
}

export async function my(req, res) {
  const operations = await workOrderOperationService.findAssignedOperations(req.user.id);
  res.json({ data: operations });
}

export async function start(req, res) {
  const operation = await workOrderOperationService.startOperation(req.user, req.params.id);
  res.json({ data: operation });
}

export async function pause(req, res) {
  const operation = await workOrderOperationService.pauseOperation(req.user, req.params.id);
  res.json({ data: operation });
}

export async function complete(req, res) {
  const operation = await workOrderOperationService.completeOperation(req.user, req.params.id);
  res.json({ data: operation });
}

export async function createMessage(req, res) {
  const message = await workOrderOperationService.createOperationMessage(req.user, req.params.id, req.validated.body);
  res.status(201).json({ data: message });
}
