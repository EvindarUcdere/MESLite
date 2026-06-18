import * as inventoryService from "./inventory.service.js";

export async function listStockItems(_req, res) {
  const stockItems = await inventoryService.listStockItems();
  res.json({ data: stockItems });
}

export async function listStockMovements(req, res) {
  const movements = await inventoryService.listStockMovements(req.query);
  res.json({ data: movements });
}

export async function updateStockItem(req, res) {
  const stockItem = await inventoryService.updateStockItemSettings(req.params.productId, req.validated.body);
  res.json({ data: stockItem });
}

export async function createMovement(req, res) {
  const result = await inventoryService.createStockMovement(req.validated.body, req.user.id);
  res.status(201).json({ data: result });
}
