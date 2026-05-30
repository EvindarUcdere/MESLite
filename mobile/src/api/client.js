import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeModules, Platform } from "react-native";

function getDevelopmentHost() {
  if (Platform.OS === "web" && globalThis.location?.hostname) {
    return globalThis.location.hostname;
  }

  const scriptUrl = NativeModules.SourceCode?.scriptURL;
  return scriptUrl?.match(/^https?:\/\/([^:/]+)/)?.[1] ?? null;
}

function getApiBaseUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  const host = getDevelopmentHost();

  if (host && host !== "localhost" && host !== "127.0.0.1") {
    return `http://${host}:4000/api`;
  }

  return "http://localhost:4000/api";
}

export const apiClient = axios.create({
  baseURL: getApiBaseUrl()
});

apiClient.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem("mes_lite_mobile_token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});
