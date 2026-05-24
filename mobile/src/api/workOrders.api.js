import { apiClient } from "./client";

export async function getWorkOrders() {
  const response = await apiClient.get("/work-orders");
  return response.data.data;
}

export async function startWorkOrder(workOrderId) {
  const response = await apiClient.post(`/work-orders/${workOrderId}/start`);
  return response.data.data;
}

export async function pauseWorkOrder(workOrderId) {
  const response = await apiClient.post(`/work-orders/${workOrderId}/pause`);
  return response.data.data;
}

export async function completeWorkOrder(workOrderId) {
  const response = await apiClient.post(`/work-orders/${workOrderId}/complete`);
  return response.data.data;
}
