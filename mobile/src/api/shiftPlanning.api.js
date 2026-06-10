import { apiClient } from "./client";

export async function getShiftAssignments(params) {
  const response = await apiClient.get("/shift-assignments", { params });
  return response.data.data;
}
