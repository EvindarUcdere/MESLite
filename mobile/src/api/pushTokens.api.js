import { apiClient } from "./client";

export async function registerPushToken(payload) {
  const response = await apiClient.post("/push-tokens", payload);
  return response.data.data;
}

export async function deactivatePushToken(token) {
  const response = await apiClient.delete("/push-tokens", { data: { token } });
  return response.data.data;
}
