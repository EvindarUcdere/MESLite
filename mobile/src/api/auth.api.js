import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiClient } from "./client";

export async function login(credentials) {
  const response = await apiClient.post("/auth/login", credentials);
  const session = response.data;

  await AsyncStorage.setItem("mes_lite_mobile_token", session.token);
  await AsyncStorage.setItem("mes_lite_mobile_user", JSON.stringify(session.user));

  return session;
}

export async function getStoredSession() {
  const token = await AsyncStorage.getItem("mes_lite_mobile_token");
  const userJson = await AsyncStorage.getItem("mes_lite_mobile_user");

  return {
    token,
    user: userJson ? JSON.parse(userJson) : null
  };
}

export async function logout() {
  await AsyncStorage.removeItem("mes_lite_mobile_token");
  await AsyncStorage.removeItem("mes_lite_mobile_user");
}
