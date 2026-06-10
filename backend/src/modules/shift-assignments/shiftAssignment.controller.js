import * as shiftAssignmentService from "./shiftAssignment.service.js";

export async function list(req, res) {
  const assignments = await shiftAssignmentService.findShiftAssignments(req.validated.query);
  res.json({ data: assignments });
}

export async function upsert(req, res) {
  const assignment = await shiftAssignmentService.upsertShiftAssignment(req.validated.body);
  res.status(201).json({ data: assignment });
}

export async function bulkUpsert(req, res) {
  const result = await shiftAssignmentService.bulkUpsertShiftAssignments(req.validated.body);
  res.status(200).json({ data: result });
}

export async function update(req, res) {
  const assignment = await shiftAssignmentService.updateShiftAssignment(req.params.id, req.validated.body);
  res.json({ data: assignment });
}

export async function remove(req, res) {
  await shiftAssignmentService.deleteShiftAssignment(req.params.id);
  res.status(204).send();
}
