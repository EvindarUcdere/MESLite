import { apiClient } from "./client.js";

export async function startWorkOrderOperation(operationId) {
  const response = await apiClient.post(`/work-order-operations/${operationId}/start`);
  return response.data.data;
}

export async function pauseWorkOrderOperation(operationId, payload) {
  const response = await apiClient.post(`/work-order-operations/${operationId}/pause`, payload);
  return response.data.data;
}

export async function completeWorkOrderOperation(operationId) {
  const response = await apiClient.post(`/work-order-operations/${operationId}/complete`);
  return response.data.data;
}

export async function createOperationMessage(operationId, payload) {
  const response = await apiClient.post(`/work-order-operations/${operationId}/messages`, payload);
  return response.data.data;
}
