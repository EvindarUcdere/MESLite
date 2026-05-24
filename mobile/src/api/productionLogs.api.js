import { apiClient } from "./client";

export async function createProductionLog(payload) {
  const response = await apiClient.post("/production-logs", payload);
  return response.data.data;
}
