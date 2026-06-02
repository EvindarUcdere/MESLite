import * as workOrderService from "./workOrder.service.js";

export async function list(_req, res) {
  const workOrders = await workOrderService.findWorkOrders();
  res.json({ data: workOrders });
}

export async function detail(req, res) {
  const workOrder = await workOrderService.findWorkOrderById(req.params.id);
  res.json({ data: workOrder });
}

export async function create(req, res) {
  const workOrder = await workOrderService.createWorkOrder(req.user.id, req.validated.body);
  res.status(201).json({ data: workOrder });
}

export async function updateStatus(req, res) {
  const workOrder = await workOrderService.updateWorkOrderStatus(req.user, req.params.id, req.validated.body.status);
  res.json({ data: workOrder });
}

export async function assignOperator(req, res) {
  const workOrder = await workOrderService.assignOperator(req.user, req.params.id, req.validated.body.operatorId);
  res.json({ data: workOrder });
}

export async function assignMachine(req, res) {
  const workOrder = await workOrderService.assignMachine(req.user, req.params.id, req.validated.body.machineId);
  res.json({ data: workOrder });
}

export async function start(req, res) {
  const workOrder = await workOrderService.startWorkOrder(req.params.id, req.user);
  res.json({ data: workOrder });
}

export async function pause(req, res) {
  const workOrder = await workOrderService.pauseWorkOrder(req.params.id, req.user);
  res.json({ data: workOrder });
}

export async function complete(req, res) {
  const workOrder = await workOrderService.completeWorkOrder(req.user, req.params.id);
  res.json({ data: workOrder });
}
