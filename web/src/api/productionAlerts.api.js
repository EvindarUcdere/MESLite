import { apiClient } from "./client.js";

export async function getProductionAlerts(params = {}) {
  const response = await apiClient.get("/production-alerts", { params });
  return response.data.data;
}

export async function updateProductionAlert(alertId, payload) {
  const response = await apiClient.patch(`/production-alerts/${alertId}`, payload);
  return response.data.data;
}

export async function decideProductionAlertQualityAction(alertId, payload) {
  const response = await apiClient.post(`/production-alerts/${alertId}/quality-action`, payload);
  return response.data.data;
}
