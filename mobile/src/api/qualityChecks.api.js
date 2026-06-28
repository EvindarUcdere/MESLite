import { apiClient } from "./client";
import { executeOrQueue } from "../offline/offlineApi";

export async function getQualityChecks() {
  const response = await apiClient.get("/quality-checks");
  return response.data.data;
}

export async function createQualityCheck(payload) {
  return executeOrQueue({
    type: "QUALITY_CHECK",
    payload,
    request: async (body) => {
      const response = await apiClient.post("/quality-checks", body);
      return response.data.data;
    }
  });
}
