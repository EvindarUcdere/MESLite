import { apiClient } from "./client.js";

export async function getWorkOrders() {
  const response = await apiClient.get("/work-orders");
  return response.data.data;
}

export async function createWorkOrder(payload) {
  const response = await apiClient.post("/work-orders", payload);
  return response.data.data;
}

export async function getAvailableOperators(params) {
  const response = await apiClient.get("/work-orders/available-operators", { params });
  return response.data.data;
}

export async function assignOperator(workOrderId, operatorId) {
  const response = await apiClient.patch(`/work-orders/${workOrderId}/assign-operator`, { operatorId });
  return response.data.data;
}

export async function assignMachine(workOrderId, machineId) {
  const response = await apiClient.patch(`/work-orders/${workOrderId}/assign-machine`, { machineId });
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
