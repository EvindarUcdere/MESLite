import { apiClient } from "./client";

export async function createMobileDebugLog(payload) {
  const response = await apiClient.post("/mobile-debug-logs", payload);
  return response.data.data;
}

