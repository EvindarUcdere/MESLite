import { apiClient } from "./client.js";

export async function getStockItems() {
  const response = await apiClient.get("/inventory/stock-items");
  return response.data.data;
}

export async function getStockMovements(params = {}) {
  const response = await apiClient.get("/inventory/movements", { params });
  return response.data.data;
}

export async function getMaterialCheck(params) {
  const response = await apiClient.get("/inventory/material-check", { params });
  return response.data.data;
}

export async function updateStockItem(productId, payload) {
  const response = await apiClient.patch(`/inventory/stock-items/${productId}`, payload);
  return response.data.data;
}

export async function createStockMovement(payload) {
  const response = await apiClient.post("/inventory/movements", payload);
  return response.data.data;
}
