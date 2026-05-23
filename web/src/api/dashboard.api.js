import { apiClient } from "./client.js";

export async function getDashboardSummary() {
  const response = await apiClient.get("/dashboard/summary");
  return response.data.data;
}

export async function getLiveOverview() {
  const response = await apiClient.get("/dashboard/live");
  return response.data.data;
}
