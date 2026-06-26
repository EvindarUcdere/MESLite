import { apiClient } from "./client";
import { executeOrQueue } from "../offline/offlineApi";

export async function startWorkOrderOperation(operationId) {
  return executeOrQueue({
    type: "OPERATION_START",
    payload: { workOrderOperationId: operationId },
    request: async (body) => {
      const response = await apiClient.post(`/work-order-operations/${operationId}/start`, body);
      return response.data.data;
    }
  });
}

export async function pauseWorkOrderOperation(operationId, payload) {
  return executeOrQueue({
    type: "OPERATION_PAUSE",
    payload: { ...payload, workOrderOperationId: operationId },
    request: async (body) => {
      const response = await apiClient.post(`/work-order-operations/${operationId}/pause`, body);
      return response.data.data;
    }
  });
}

export async function completeWorkOrderOperation(operationId) {
  return executeOrQueue({
    type: "OPERATION_COMPLETE",
    payload: { workOrderOperationId: operationId },
    request: async (body) => {
      const response = await apiClient.post(`/work-order-operations/${operationId}/complete`, body);
      return response.data.data;
    }
  });
}

export async function createOperationMessage(operationId, payload) {
  return executeOrQueue({
    type: "OPERATION_MESSAGE",
    payload: { ...payload, workOrderOperationId: operationId },
    request: async (body) => {
      const response = await apiClient.post(`/work-order-operations/${operationId}/messages`, body);
      return response.data.data;
    }
  });
}
