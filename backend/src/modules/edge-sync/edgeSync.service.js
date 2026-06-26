import { prisma } from "../../config/db.js";
import { env } from "../../config/env.js";
import { ApiError } from "../../utils/ApiError.js";
import { runIdempotentOperation } from "../offline-operations/offlineOperation.service.js";
import * as productionAlertService from "../production-alerts/productionAlert.service.js";
import * as productionLogService from "../production-logs/productionLog.service.js";
import * as qualityCheckService from "../quality-checks/qualityCheck.service.js";
import * as workOrderOperationService from "../work-order-operations/workOrderOperation.service.js";

const CLOUD_SYNC_LIMIT = 25;
const MAX_CLOUD_RETRY_COUNT = 10;

function getCloudApiUrl() {
  return env.edgeCloudApiUrl?.replace(/\/$/, "");
}

function getOperationHandler({ type, user, payload }) {
  switch (type) {
    case "PRODUCTION_LOG":
      return {
        workOrderId: payload.workOrderId,
        handler: () => productionLogService.createProductionLog(user, payload)
      };
    case "SCRAP_ACTION":
      return {
        workOrderId: payload.workOrderId,
        handler: () => productionLogService.createScrapActionForProductionLog(user, payload.productionLogId, payload)
      };
    case "OPERATION_START":
      return {
        workOrderId: payload.workOrderId,
        handler: () => workOrderOperationService.startOperation(user, payload.workOrderOperationId)
      };
    case "OPERATION_PAUSE":
      return {
        workOrderId: payload.workOrderId,
        handler: () => workOrderOperationService.pauseOperation(user, payload.workOrderOperationId, payload)
      };
    case "OPERATION_COMPLETE":
      return {
        workOrderId: payload.workOrderId,
        handler: () => workOrderOperationService.completeOperation(user, payload.workOrderOperationId)
      };
    case "OPERATION_MESSAGE":
      return {
        workOrderId: payload.workOrderId,
        handler: () => workOrderOperationService.createOperationMessage(user, payload.workOrderOperationId, payload)
      };
    case "QUALITY_CHECK":
      return {
        workOrderId: payload.workOrderId,
        handler: () => qualityCheckService.createQualityCheck(user, payload)
      };
    case "QUALITY_ACTION_DECISION":
      return {
        workOrderId: payload.workOrderId,
        handler: () => productionAlertService.decideQualityAction(user, payload.alertId, payload)
      };
    default:
      throw new ApiError(400, `Unsupported edge sync operation type: ${type}`);
  }
}

export async function applyEdgeOperation({ operationId, type, userId, userEmail, workOrderId, payload }) {
  const user = userId
    ? await prisma.user.findUnique({ where: { id: userId } })
    : userEmail
      ? await prisma.user.findUnique({ where: { email: userEmail } })
      : null;

  if (!user && userEmail) {
    throw new ApiError(404, `Edge sync user not found: ${userEmail}`);
  }

  if (!user) {
    throw new ApiError(404, `Edge sync user not found: ${userId}`);
  }

  const operation = getOperationHandler({ type, user, payload: payload ?? {} });

  return runIdempotentOperation({
    operationId,
    type,
    user,
    workOrderId: workOrderId ?? operation.workOrderId,
    payload,
    handler: operation.handler
  });
}

async function pushOperationToCloud(operation) {
  const response = await fetch(`${getCloudApiUrl()}/edge-sync/operations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-edge-sync-secret": env.edgeSyncSecret
    },
    body: JSON.stringify({
      operationId: operation.operationId,
      type: operation.type,
      userId: operation.userId,
      userEmail: operation.user?.email,
      workOrderId: operation.workOrderId,
      payload: operation.payload
    })
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(body.message ?? `Cloud sync failed with ${response.status}`);
    error.statusCode = response.status;
    throw error;
  }

  return body;
}

export async function syncEdgeOperationsToCloud() {
  if (!env.edgeMode || !getCloudApiUrl() || !env.edgeSyncSecret) {
    return { skipped: true, synced: 0, failed: 0 };
  }

  const operations = await prisma.offlineOperationLog.findMany({
    where: {
      status: "SYNCED",
      cloudSyncStatus: { in: ["PENDING", "FAILED"] },
      cloudRetryCount: { lt: MAX_CLOUD_RETRY_COUNT }
    },
    orderBy: { createdAt: "asc" },
    take: CLOUD_SYNC_LIMIT,
    include: { user: { select: { email: true } } }
  });

  let synced = 0;
  let failed = 0;

  for (const operation of operations) {
    try {
      await pushOperationToCloud(operation);
      await prisma.offlineOperationLog.update({
        where: { operationId: operation.operationId },
        data: {
          cloudSyncStatus: "SYNCED",
          cloudErrorMessage: null,
          cloudSyncedAt: new Date()
        }
      });
      synced += 1;
    } catch (error) {
      await prisma.offlineOperationLog.update({
        where: { operationId: operation.operationId },
        data: {
          cloudSyncStatus: "FAILED",
          cloudRetryCount: operation.cloudRetryCount + 1,
          cloudErrorMessage: error.message ?? "Cloud sync failed"
        }
      });
      failed += 1;

      if (!error.statusCode || error.statusCode >= 500) {
        break;
      }
    }
  }

  return { skipped: false, synced, failed };
}

export function startEdgeSyncWorker() {
  if (!env.edgeMode || !getCloudApiUrl() || !env.edgeSyncSecret) {
    return null;
  }

  const run = () => {
    syncEdgeOperationsToCloud()
      .then((result) => {
        if (result.synced || result.failed) {
          console.log(`[edge-sync] cloud synced=${result.synced} failed=${result.failed}`);
        }
      })
      .catch((error) => {
        console.error("[edge-sync] worker failed:", error.message);
      });
  };

  setTimeout(run, 5000);
  return setInterval(run, env.edgeSyncIntervalMs);
}
