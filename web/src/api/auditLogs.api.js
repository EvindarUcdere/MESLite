import { apiClient } from "./client.js";

export async function getAuditLogs(params = {}) {
  const response = await apiClient.get("/audit-logs", { params });
  return response.data.data;
}
