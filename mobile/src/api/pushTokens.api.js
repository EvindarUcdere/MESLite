import { apiClient } from "./client";

export async function registerPushToken(payload) {
  const response = await apiClient.post("/push-tokens", payload);
  return response.data.data;
}

export async function getMyPushTokens() {
  const response = await apiClient.get("/push-tokens/me");
  return response.data.data;
}

export async function sendPushTestNotification() {
  const response = await apiClient.post("/push-tokens/test");
  return response.data.data;
}

export async function deactivatePushToken(token) {
  const response = await apiClient.delete("/push-tokens", { data: { token } });
  return response.data.data;
}
