import { apiClient } from "./client.js";

export async function login(credentials) {
  const response = await apiClient.post("/auth/login", credentials);
  return response.data;
}

export async function getCurrentUser() {
  const response = await apiClient.get("/auth/me");
  return response.data;
}
