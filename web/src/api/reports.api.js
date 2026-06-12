import { apiClient } from "./client.js";

export async function getOverviewReport(params = {}) {
  const response = await apiClient.get("/reports/overview", { params });
  return response.data.data;
}
