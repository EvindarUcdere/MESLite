import { apiClient } from "./client.js";

export async function getProductRoutes() {
  const response = await apiClient.get("/product-routes");
  return response.data.data;
}

export async function createProductRoute(payload) {
  const response = await apiClient.post("/product-routes", payload);
  return response.data.data;
}
