import { apiClient } from "./client.js";

export async function getProducts() {
  const response = await apiClient.get("/products");
  return response.data.data;
}

export async function getMachines() {
  const response = await apiClient.get("/machines");
  return response.data.data;
}

export async function getUsers() {
  const response = await apiClient.get("/users");
  return response.data.data;
}
