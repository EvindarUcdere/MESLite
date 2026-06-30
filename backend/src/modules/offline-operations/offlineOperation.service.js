import { prisma } from "../../config/db.js";
import { env } from "../../config/env.js";

function sanitizePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return payload ?? null;
  }

  const { password, token, ...safePayload } = payload;
  return safePayload;
}

export function getClientContextFromRequest(req) {
  return {
    source: req.get("x-mes-operation-source") || "UNKNOWN",
    clientCreatedAt: req.get("x-mes-client-created-at") || null
  };
}

async function findSyncedOperation(operationId) {
  const existing = await prisma.offlineOperationLog.findUnique({
    where: { operationId }
  });

  if (existing?.status !== "SYNCED") {
    return null;
  }

  return {
    data: existing.response,
    idempotent: true
  };
}

async function resolveWorkOrderId(workOrderId, payload) {
  if (workOrderId) {
    return workOrderId;
  }

  if (payload?.workOrderOperationId) {
    const operation = await prisma.workOrderOperation.findUnique({
      where: { id: payload.workOrderOperationId },
      select: { workOrderId: true }
    });
    return operation?.workOrderId ?? null;
  }

  if (payload?.productionLogId) {
    const productionLog = await prisma.productionLog.findUnique({
      where: { id: payload.productionLogId },
      select: { workOrderId: true }
    });
    return productionLog?.workOrderId ?? null;
  }

  if (payload?.alertId) {
    const alert = await prisma.productionAlert.findUnique({
      where: { id: payload.alertId },
      select: { workOrderId: true }
    });
    return alert?.workOrderId ?? null;
  }

  return null;
}

export async function runIdempotentOperation({ operationId, type, user, workOrderId, payload, clientContext, handler }) {
  if (!operationId) {
    return {
      data: await handler(),
      idempotent: false
    };
  }

  const syncedOperation = await findSyncedOperation(operationId);
  if (syncedOperation) {
    return syncedOperation;
  }

  const resolvedWorkOrderId = await resolveWorkOrderId(workOrderId, payload);

  try {
    await prisma.offlineOperationLog.create({
      data: {
        operationId,
        type,
        userId: user.id,
        workOrderId: resolvedWorkOrderId,
        payload: {
          ...(sanitizePayload(payload) ?? {}),
          _clientContext: clientContext ?? { source: "UNKNOWN", clientCreatedAt: null }
        },
        status: "PENDING",
        cloudSyncStatus: env.edgeMode ? "PENDING" : "NOT_REQUIRED"
      }
    });
  } catch (error) {
    if (error.code !== "P2002") {
      throw error;
    }

    const syncedRetry = await findSyncedOperation(operationId);
    if (syncedRetry) {
      return syncedRetry;
    }
  }

  const lock = await prisma.offlineOperationLog.updateMany({
    where: {
      operationId,
      status: { in: ["PENDING", "FAILED"] }
    },
    data: {
      status: "PROCESSING",
      errorMessage: null
    }
  });

  if (!lock.count) {
    const syncedRetry = await findSyncedOperation(operationId);
    if (syncedRetry) {
      return syncedRetry;
    }

    const error = new Error("Operation is already being processed");
    error.statusCode = 409;
    throw error;
  }

  try {
    const data = await handler();

    await prisma.offlineOperationLog.update({
      where: { operationId },
      data: {
        response: data ?? null,
        status: "SYNCED",
        errorMessage: null,
        syncedAt: new Date()
      }
    });

    return { data, idempotent: false };
  } catch (error) {
    await prisma.offlineOperationLog.update({
      where: { operationId },
      data: {
        status: "FAILED",
        errorMessage: error.message ?? "Operation failed"
      }
    });

    throw error;
  }
}

export async function findOfflineOperationLogs({ limit = 150, status, type, userId, workOrderId } = {}) {
  const logs = await prisma.offlineOperationLog.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
      ...(userId ? { userId } : {}),
      ...(workOrderId ? { workOrderId } : {})
    },
    include: {
      user: { select: { id: true, name: true, email: true, role: true } }
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(Number(limit) || 150, 300)
  });

  const workOrderIds = [...new Set(logs.map((log) => log.workOrderId).filter(Boolean))];
  const workOrders = workOrderIds.length
    ? await prisma.workOrder.findMany({
        where: { id: { in: workOrderIds } },
        select: { id: true, orderNo: true, product: { select: { code: true, name: true } } }
      })
    : [];
  const workOrdersById = new Map(workOrders.map((workOrder) => [workOrder.id, workOrder]));

  return logs.map((log) => ({
    ...log,
    clientContext: log.payload?._clientContext ?? { source: "UNKNOWN", clientCreatedAt: null },
    workOrder: log.workOrderId ? workOrdersById.get(log.workOrderId) ?? null : null
  }));
}
