import { apiClient } from "./client.js";

export async function getQualityChecks() {
  const response = await apiClient.get("/quality-checks");
  return response.data.data;
}

export async function createQualityCheck(payload) {
  const response = await apiClient.post("/quality-checks", payload);
  return response.data.data;
}
