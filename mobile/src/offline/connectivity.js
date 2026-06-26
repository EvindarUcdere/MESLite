import { getApiBaseUrl } from "../api/client";

const HEALTH_TIMEOUT_MS = 4000;

export async function checkBackendReachable() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  const baseUrl = getApiBaseUrl().replace(/\/api\/?$/, "");

  try {
    const response = await fetch(`${baseUrl}/health`, {
      method: "GET",
      signal: controller.signal
    });

    return response.ok;
  } catch (_error) {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
