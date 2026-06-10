import { apiClient } from "./client.js";

export async function getShifts() {
  const response = await apiClient.get("/shifts");
  return response.data.data;
}

export async function getShiftAssignments(params) {
  const response = await apiClient.get("/shift-assignments", { params });
  return response.data.data;
}

export async function upsertShiftAssignment(payload) {
  const response = await apiClient.post("/shift-assignments", payload);
  return response.data.data;
}

export async function bulkUpsertShiftAssignments(payload) {
  const response = await apiClient.post("/shift-assignments/bulk", payload);
  return response.data.data;
}

export async function deleteShiftAssignment(assignmentId) {
  await apiClient.delete(`/shift-assignments/${assignmentId}`);
}

export async function getOperatorMachineSkills(params) {
  const response = await apiClient.get("/operator-machine-skills", { params });
  return response.data.data;
}

export async function upsertOperatorMachineSkill(payload) {
  const response = await apiClient.post("/operator-machine-skills", payload);
  return response.data.data;
}

export async function deleteOperatorMachineSkill(skillId) {
  await apiClient.delete(`/operator-machine-skills/${skillId}`);
}

export async function getOperatorGroups() {
  const response = await apiClient.get("/shift-planning/groups");
  return response.data.data;
}

export async function createOperatorGroup(payload) {
  const response = await apiClient.post("/shift-planning/groups", payload);
  return response.data.data;
}

export async function updateOperatorGroup(groupId, payload) {
  const response = await apiClient.put(`/shift-planning/groups/${groupId}`, payload);
  return response.data.data;
}

export async function getShiftTemplates() {
  const response = await apiClient.get("/shift-planning/templates");
  return response.data.data;
}

export async function createShiftTemplate(payload) {
  const response = await apiClient.post("/shift-planning/templates", payload);
  return response.data.data;
}

export async function generateMonthlyShiftPlan(payload) {
  const response = await apiClient.post("/shift-planning/generate-monthly", payload);
  return response.data.data;
}
