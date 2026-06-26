import { apiClient } from "../api/client";
import { checkBackendReachable } from "./connectivity";
import { isNetworkError } from "./offlineApi";
import { getOfflineQueueSummary, getPendingOfflineOperations, markOfflineOperationFailed, markOfflineOperationRetry, markOfflineOperationSynced } from "./offlineQueue";

const MAX_RETRY_COUNT = 3;

function getSyncRequest(operation) {
  const payload = operation.payload ?? {};

  switch (operation.type) {
    case "PRODUCTION_LOG":
      return () => apiClient.post("/production-logs", payload);
    case "OPERATION_START":
      return () => apiClient.post(`/work-order-operations/${payload.workOrderOperationId}/start`, payload);
    case "OPERATION_PAUSE":
      return () => apiClient.post(`/work-order-operations/${payload.workOrderOperationId}/pause`, payload);
    case "OPERATION_COMPLETE":
      return () => apiClient.post(`/work-order-operations/${payload.workOrderOperationId}/complete`, payload);
    case "OPERATION_MESSAGE":
      return () => apiClient.post(`/work-order-operations/${payload.workOrderOperationId}/messages`, payload);
    case "QUALITY_CHECK":
      return () => apiClient.post("/quality-checks", payload);
    case "QUALITY_ACTION_DECISION":
      return () => apiClient.post(`/production-alerts/${payload.alertId}/quality-action`, payload);
    case "SCRAP_ACTION":
      return () => apiClient.post(`/production-logs/${payload.productionLogId}/scrap-action`, payload);
    default:
      return null;
  }
}

function getSyncErrorMessage(error) {
  return error?.response?.data?.message ?? error?.message ?? "Senkronizasyon hatası";
}

export async function syncOfflineQueue() {
  const isReachable = await checkBackendReachable();

  if (!isReachable) {
    return {
      isOnline: false,
      ...(await getOfflineQueueSummary())
    };
  }

  const operations = await getPendingOfflineOperations();

  for (const operation of operations) {
    const request = getSyncRequest(operation);

    if (!request) {
      await markOfflineOperationFailed(operation.id, operation.retryCount + 1, `Desteklenmeyen offline işlem: ${operation.type}`);
      continue;
    }

    try {
      await request();
      await markOfflineOperationSynced(operation.id);
    } catch (error) {
      const nextRetryCount = operation.retryCount + 1;
      const errorMessage = getSyncErrorMessage(error);

      if (isNetworkError(error)) {
        await markOfflineOperationRetry(operation.id, nextRetryCount, errorMessage);
        break;
      }

      if (nextRetryCount >= MAX_RETRY_COUNT) {
        await markOfflineOperationFailed(operation.id, nextRetryCount, errorMessage);
      } else {
        await markOfflineOperationRetry(operation.id, nextRetryCount, errorMessage);
      }
    }
  }

  return {
    isOnline: true,
    ...(await getOfflineQueueSummary())
  };
}
