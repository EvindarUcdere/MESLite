import { apiClient } from "./client.js";

export async function getDomainEventLogs(params = {}) {
  const response = await apiClient.get("/domain-event-logs", { params });
  return response.data.data;
}
