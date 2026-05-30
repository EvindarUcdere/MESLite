import { apiClient } from "./client.js";

export async function updateProductionAlert(alertId, payload) {
  const response = await apiClient.patch(`/production-alerts/${alertId}`, payload);
  return response.data.data;
}
