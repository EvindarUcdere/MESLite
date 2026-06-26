import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { NativeModules, Platform } from "react-native";

const ACTIVE_API_URL_KEY = "mes_lite_active_api_url";
const API_HEALTH_TIMEOUT_MS = 2500;
const API_RESOLVE_TTL_MS = 10000;

let activeApiUrlCache = null;
let activeApiUrlCheckedAt = 0;

function getDevelopmentHost() {
  if (Platform.OS === "web" && globalThis.location?.hostname) {
    return globalThis.location.hostname;
  }

  const scriptUrl = NativeModules.SourceCode?.scriptURL;
  return scriptUrl?.match(/^https?:\/\/([^:/]+)/)?.[1] ?? null;
}

function normalizeApiUrl(url) {
  return url?.replace(/\/$/, "");
}

function getCloudApiBaseUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return normalizeApiUrl(process.env.EXPO_PUBLIC_API_URL);
  }

  const host = getDevelopmentHost();

  if (Platform.OS === "web" && host) {
    if (host === "localhost" || host === "127.0.0.1") {
      return "http://localhost:4000/api";
    }

    return `http://${host}:4000/api`;
  }

  if (Constants.expoConfig?.extra?.apiUrl) {
    return normalizeApiUrl(Constants.expoConfig.extra.apiUrl);
  }

  return "http://localhost:4000/api";
}

function getApiBaseCandidates() {
  const edgeUrl = normalizeApiUrl(process.env.EXPO_PUBLIC_EDGE_API_URL ?? Constants.expoConfig?.extra?.edgeApiUrl);
  const cloudUrl = getCloudApiBaseUrl();
  return [edgeUrl, cloudUrl].filter(Boolean);
}

async function isApiReachable(apiUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_HEALTH_TIMEOUT_MS);

  try {
    const response = await fetch(`${apiUrl.replace(/\/api\/?$/, "")}/health`, {
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

export function getApiBaseUrl() {
  return activeApiUrlCache ?? getApiBaseCandidates()[0] ?? getCloudApiBaseUrl();
}

export async function resolveApiBaseUrl({ force = false } = {}) {
  const now = Date.now();

  if (!force && activeApiUrlCache && now - activeApiUrlCheckedAt < API_RESOLVE_TTL_MS) {
    return activeApiUrlCache;
  }

  const candidates = getApiBaseCandidates();
  const storedApiUrl = await AsyncStorage.getItem(ACTIVE_API_URL_KEY);
  const orderedCandidates = [storedApiUrl, ...candidates].filter(Boolean);

  for (const candidate of [...new Set(orderedCandidates)]) {
    if (await isApiReachable(candidate)) {
      activeApiUrlCache = candidate;
      activeApiUrlCheckedAt = now;
      await AsyncStorage.setItem(ACTIVE_API_URL_KEY, candidate);
      return candidate;
    }
  }

  activeApiUrlCache = candidates[0] ?? getCloudApiBaseUrl();
  activeApiUrlCheckedAt = now;
  return activeApiUrlCache;
}

export const apiClient = axios.create({
  baseURL: getApiBaseUrl()
});

apiClient.interceptors.request.use(async (config) => {
  config.baseURL = await resolveApiBaseUrl();
  const token = await AsyncStorage.getItem("mes_lite_mobile_token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});
