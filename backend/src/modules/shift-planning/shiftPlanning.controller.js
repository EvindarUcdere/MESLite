import * as shiftPlanningService from "./shiftPlanning.service.js";

export async function listGroups(_req, res) {
  const groups = await shiftPlanningService.findOperatorGroups();
  res.json({ data: groups });
}

export async function createGroup(req, res) {
  const group = await shiftPlanningService.createOperatorGroup(req.validated.body);
  res.status(201).json({ data: group });
}

export async function updateGroup(req, res) {
  const group = await shiftPlanningService.updateOperatorGroup(req.params.id, req.validated.body);
  res.json({ data: group });
}

export async function removeGroup(req, res) {
  await shiftPlanningService.deleteOperatorGroup(req.params.id);
  res.status(204).send();
}

export async function listTemplates(_req, res) {
  const templates = await shiftPlanningService.findShiftTemplates();
  res.json({ data: templates });
}

export async function createTemplate(req, res) {
  const template = await shiftPlanningService.createShiftTemplate(req.validated.body);
  res.status(201).json({ data: template });
}

export async function updateTemplate(req, res) {
  const template = await shiftPlanningService.updateShiftTemplate(req.params.id, req.validated.body);
  res.json({ data: template });
}

export async function removeTemplate(req, res) {
  await shiftPlanningService.deleteShiftTemplate(req.params.id);
  res.status(204).send();
}

export async function generateMonthlyPlan(req, res) {
  const result = await shiftPlanningService.generateMonthlyPlan(req.validated.body);
  res.status(201).json({ data: result });
}
