import * as productionLineService from "./productionLine.service.js";

export async function list(_req, res) {
  const lines = await productionLineService.findProductionLines();
  res.json({ data: lines });
}

export async function detail(req, res) {
  const line = await productionLineService.findProductionLineById(req.params.id);
  res.json({ data: line });
}

export async function create(req, res) {
  const line = await productionLineService.createProductionLine(req.validated.body);
  res.status(201).json({ data: line });
}

export async function update(req, res) {
  const line = await productionLineService.updateProductionLine(req.params.id, req.validated.body);
  res.json({ data: line });
}
