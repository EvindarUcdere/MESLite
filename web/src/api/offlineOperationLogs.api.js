import { apiClient } from "./client.js";

export async function getOfflineOperationLogs(params = {}) {
  const response = await apiClient.get("/offline-operation-logs", { params });
  return response.data.data;
}
