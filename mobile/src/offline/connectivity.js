import { resolveApiBaseUrl } from "../api/client";

export async function checkBackendReachable() {
  try {
    return Boolean(await resolveApiBaseUrl({ force: true, requireReachable: true }));
  } catch (_error) {
    return false;
  }
}
