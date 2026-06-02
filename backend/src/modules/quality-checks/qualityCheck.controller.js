import * as qualityCheckService from "./qualityCheck.service.js";

export async function list(_req, res) {
  const checks = await qualityCheckService.findQualityChecks();
  res.json({ data: checks });
}

export async function detail(req, res) {
  const check = await qualityCheckService.findQualityCheckById(req.params.id);
  res.json({ data: check });
}

export async function create(req, res) {
  const check = await qualityCheckService.createQualityCheck(req.user, req.validated.body);
  res.status(201).json({ data: check });
}

export async function update(req, res) {
  const check = await qualityCheckService.updateQualityCheck(req.user, req.params.id, req.validated.body);
  res.json({ data: check });
}
