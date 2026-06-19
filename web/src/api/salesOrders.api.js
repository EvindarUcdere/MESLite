import { apiClient } from "./client.js";

export async function getSalesOrders() {
  const response = await apiClient.get("/sales-orders");
  return response.data.data;
}

export async function createSalesOrder(payload) {
  const response = await apiClient.post("/sales-orders", payload);
  return response.data.data;
}

export async function getSalesOrderMrp(salesOrderId) {
  const response = await apiClient.get(`/sales-orders/${salesOrderId}/mrp`);
  return response.data.data;
}

export async function createWorkOrdersFromSalesOrder(salesOrderId, payload = {}) {
  const response = await apiClient.post(`/sales-orders/${salesOrderId}/create-work-orders`, payload);
  return response.data.data;
}
