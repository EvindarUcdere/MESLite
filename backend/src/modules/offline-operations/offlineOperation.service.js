import { prisma } from "../../config/db.js";

function sanitizePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return payload ?? null;
  }

  const { password, token, ...safePayload } = payload;
  return safePayload;
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

export async function runIdempotentOperation({ operationId, type, user, workOrderId, payload, handler }) {
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

  try {
    await prisma.offlineOperationLog.create({
      data: {
        operationId,
        type,
        userId: user.id,
        workOrderId,
        payload: sanitizePayload(payload),
        status: "PENDING"
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
