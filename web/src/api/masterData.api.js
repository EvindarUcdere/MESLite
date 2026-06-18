import { apiClient } from "./client.js";

export async function getProducts() {
  const response = await apiClient.get("/products");
  return response.data.data;
}

export async function createProduct(payload) {
  const response = await apiClient.post("/products", payload);
  return response.data.data;
}

export async function replaceProductBom(productId, items) {
  const response = await apiClient.put(`/products/${productId}/bom`, { items });
  return response.data.data;
}

export async function getMachines() {
  const response = await apiClient.get("/machines");
  return response.data.data;
}

export async function createMachine(payload) {
  const response = await apiClient.post("/machines", payload);
  return response.data.data;
}

export async function updateMachineStatus(machineId, payload) {
  const response = await apiClient.patch(`/machines/${machineId}/status`, payload);
  return response.data.data;
}

export async function getProductionLines() {
  const response = await apiClient.get("/production-lines");
  return response.data.data;
}

export async function createProductionLine(payload) {
  const response = await apiClient.post("/production-lines", payload);
  return response.data.data;
}

export async function getUsers() {
  const response = await apiClient.get("/users");
  return response.data.data;
}

export async function createUser(payload) {
  const response = await apiClient.post("/users", payload);
  return response.data.data;
}

export async function updateUser(userId, payload) {
  const response = await apiClient.put(`/users/${userId}`, payload);
  return response.data.data;
}

export async function updateUserStatus(userId, isActive) {
  const response = await apiClient.patch(`/users/${userId}/status`, { isActive });
  return response.data.data;
}
