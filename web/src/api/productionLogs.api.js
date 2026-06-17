import { apiClient } from "./client.js";

export async function getProductionLogs(params = {}) {
  const response = await apiClient.get("/production-logs", { params });
  return response.data.data;
}

export async function createProductionLog(payload) {
  const response = await apiClient.post("/production-logs", payload);
  return response.data.data;
}

export async function createScrapAction(productionLogId, payload) {
  const response = await apiClient.post(`/production-logs/${productionLogId}/scrap-action`, payload);
  return response.data.data;
}
