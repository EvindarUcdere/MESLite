import { enqueueOfflineOperation } from "./offlineQueue";
import { checkBackendReachable } from "./connectivity";

export const OFFLINE_QUEUE_RESULT = "__MES_LITE_OFFLINE_QUEUED__";

function createOperationId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    const resolved = char === "x" ? value : (value & 0x3) | 0x8;
    return resolved.toString(16);
  });
}

export function isNetworkError(error) {
  return Boolean(
    error?.message === "Network Error" ||
      error?.code === "ERR_NETWORK" ||
      error?.code === "ECONNABORTED" ||
      error?.name === "AbortError" ||
      !error?.response
  );
}

export function isOfflineQueuedResult(result) {
  return Boolean(result?.[OFFLINE_QUEUE_RESULT]);
}

export async function executeOrQueue({ type, payload, request }) {
  const operationId = payload.operationId ?? createOperationId();
  const payloadWithOperationId = {
    ...payload,
    operationId
  };

  const isReachable = await checkBackendReachable();

  if (!isReachable) {
    await enqueueOfflineOperation({ operationId, type, payload: payloadWithOperationId });
    return {
      [OFFLINE_QUEUE_RESULT]: true,
      operationId,
      type
    };
  }

  try {
    return await request(payloadWithOperationId);
  } catch (error) {
    if (isNetworkError(error)) {
      await enqueueOfflineOperation({ operationId, type, payload: payloadWithOperationId });
      return {
        [OFFLINE_QUEUE_RESULT]: true,
        operationId,
        type
      };
    }

    throw error;
  }
}
