import * as salesOrderService from "./salesOrder.service.js";

export async function list(_req, res) {
  const salesOrders = await salesOrderService.listSalesOrders();
  res.json({ data: salesOrders });
}

export async function detail(req, res) {
  const salesOrder = await salesOrderService.findSalesOrderById(req.params.id);
  res.json({ data: salesOrder });
}

export async function create(req, res) {
  const salesOrder = await salesOrderService.createSalesOrder(req.user.id, req.validated.body);
  res.status(201).json({ data: salesOrder });
}

export async function mrp(req, res) {
  const result = await salesOrderService.calculateSalesOrderMrp(req.params.id);
  res.json({ data: result });
}

export async function createWorkOrders(req, res) {
  const result = await salesOrderService.createWorkOrdersFromSalesOrder(req.user.id, req.params.id, req.validated.body);
  res.status(201).json({ data: result });
}
