import { apiClient } from "./client.js";

export async function getOverviewReport() {
  const response = await apiClient.get("/reports/overview");
  return response.data.data;
}
