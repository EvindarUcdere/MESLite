import { prisma } from "../../config/db.js";
import { emitEvent } from "../../config/socket.js";
import { ApiError } from "../../utils/ApiError.js";
import { createProductionAlert } from "../production-alerts/productionAlert.service.js";

const includeRelations = {
  workOrder: { include: { product: true } },
  workOrderOperation: true,
  operator: { select: { id: true, name: true, email: true, role: true } },
  machine: true,
  shift: true,
  attachments: true
};

export function findProductionLogs() {
  return prisma.productionLog.findMany({
    include: includeRelations,
    orderBy: { createdAt: "desc" }
  });
}

export function findProductionLogById(id) {
  return prisma.productionLog.findUnique({
    where: { id },
    include: includeRelations
  });
}

export async function createProductionLog(actor, data) {
  const isZeroQuantityLog = data.producedQuantity === 0 && data.scrapQuantity === 0;

  if (isZeroQuantityLog && !data.note?.trim()) {
    throw new ApiError(400, "A note is required when production and scrap quantities are both zero");
  }

  const result = await prisma.$transaction(async (tx) => {
    const operation = data.workOrderOperationId
      ? await tx.workOrderOperation.findUnique({
          where: { id: data.workOrderOperationId },
          include: { workOrder: true }
        })
      : null;

    if (data.workOrderOperationId && !operation) {
      throw new ApiError(404, "Work order operation not found");
    }

    if (operation && operation.workOrderId !== data.workOrderId) {
      throw new ApiError(400, "Production log operation must belong to the selected work order");
    }

    const workOrder = operation?.workOrder ?? (await tx.workOrder.findUnique({ where: { id: data.workOrderId } }));

    if (!workOrder) {
      throw new ApiError(404, "Work order not found");
    }

    const allowedWorkOrderStatuses = operation ? ["PLANNED", "IN_PROGRESS", "PAUSED"] : ["IN_PROGRESS"];

    if (!allowedWorkOrderStatuses.includes(workOrder.status)) {
      throw new ApiError(400, "Production can only be logged for in-progress work orders");
    }

    if (operation) {
      if (!["READY", "IN_PROGRESS", "PAUSED"].includes(operation.status)) {
        throw new ApiError(400, "Production can only be logged for ready, in-progress or paused operations");
      }

      if (!operation.machineId || operation.machineId !== data.machineId) {
        throw new ApiError(400, "Production log machine must match the operation machine");
      }

      if (actor.role === "OPERATOR" && operation.assignedOperatorId !== actor.id) {
        throw new ApiError(403, "Operator can only log production for assigned operations");
      }
    } else if (!workOrder.machineId || workOrder.machineId !== data.machineId) {
      throw new ApiError(400, "Production log machine must match the work order machine");
    }

    if (!operation && actor.role === "OPERATOR" && workOrder.assignedOperatorId !== actor.id) {
      throw new ApiError(403, "Operator can only log production for assigned work orders");
    }

    const remainingQuantity = workOrder.plannedQuantity - (operation ? operation.producedQuantity : workOrder.producedQuantity);

    if (data.producedQuantity > remainingQuantity) {
      throw new ApiError(400, `Produced quantity exceeds remaining planned quantity (${remainingQuantity})`);
    }

    const operatorId = actor.role === "OPERATOR" ? actor.id : operation?.assignedOperatorId ?? workOrder.assignedOperatorId;

    if (!operatorId) {
      throw new ApiError(400, "Assigned operator is required before logging production");
    }

    const log = await tx.productionLog.create({
      data: {
        workOrderId: data.workOrderId,
        workOrderOperationId: data.workOrderOperationId,
        operatorId,
        machineId: data.machineId,
        shiftId: data.shiftId,
        producedQuantity: data.producedQuantity,
        scrapQuantity: data.scrapQuantity,
        scrapReason: data.scrapQuantity > 0 ? data.scrapReason : null,
        startedAt: data.startedAt ? new Date(data.startedAt) : undefined,
        endedAt: data.endedAt ? new Date(data.endedAt) : undefined,
        note: data.note
      },
      include: includeRelations
    });

    let alert = null;

    if (data.isCriticalAlert) {
      if (!data.note?.trim()) {
        throw new ApiError(400, "Alert note is required for critical production alerts");
      }

      alert = await createProductionAlert(tx, {
        productionLog: log,
        actor,
        title: `Operatör uyarısı - ${workOrder.orderNo}`,
        message: data.note,
        severity: data.alertSeverity ?? "WARNING"
      });
    }

    let updatedOperation = null;

    if (operation) {
      updatedOperation = await tx.workOrderOperation.update({
        where: { id: operation.id },
        data: {
          status: operation.status === "READY" ? "IN_PROGRESS" : operation.status,
          startedAt: operation.startedAt ?? new Date(),
          producedQuantity: { increment: data.producedQuantity },
          scrapQuantity: { increment: data.scrapQuantity }
        },
        include: {
          workOrder: { include: { product: true, route: true } },
          routeOperation: true,
          machine: true,
          assignedOperator: {
            select: { id: true, name: true, email: true, role: true }
          },
          messages: {
            include: {
              sender: {
                select: { id: true, name: true, email: true, role: true }
              }
            },
            orderBy: { createdAt: "desc" },
            take: 5
          },
          _count: {
            select: {
              productionLogs: true
            }
          }
        }
      });
    }

    const nextOperation = operation
      ? await tx.workOrderOperation.findFirst({
          where: {
            workOrderId: operation.workOrderId,
            sequenceNo: { gt: operation.sequenceNo }
          },
          orderBy: { sequenceNo: "asc" }
        })
      : null;
    const shouldIncrementWorkOrderProduction = !operation || !nextOperation;

    const updatedWorkOrder = await tx.workOrder.update({
      where: { id: data.workOrderId },
      data: {
        status: operation && operation.status !== "PAUSED" ? "IN_PROGRESS" : workOrder.status,
        actualStartDate: workOrder.actualStartDate ?? (operation ? new Date() : undefined),
        ...(shouldIncrementWorkOrderProduction ? { producedQuantity: { increment: data.producedQuantity } } : {}),
        scrapQuantity: { increment: data.scrapQuantity }
      }
    });

    return { log, workOrder: updatedWorkOrder, operation: updatedOperation, alert };
  });

  emitEvent("production:logged", result.log);
  emitEvent("workOrder:updated", result.workOrder);
  if (result.operation) {
    emitEvent("workOrderOperation:updated", result.operation);
  }
  if (result.alert) {
    emitEvent("productionAlert:created", result.alert);
  }
  return result.log;
}

export async function addProductionLogAttachment(actor, productionLogId, file) {
  if (!file) {
    throw new ApiError(400, "Image file is required");
  }

  const productionLog = await prisma.productionLog.findUnique({
    where: { id: productionLogId },
    include: {
      workOrder: true
    }
  });

  if (!productionLog) {
    throw new ApiError(404, "Production log not found");
  }

  if (actor.role === "OPERATOR" && productionLog.operatorId !== actor.id) {
    throw new ApiError(403, "Operator can only attach images to own production logs");
  }

  const attachment = await prisma.productionLogAttachment.create({
    data: {
      productionLogId,
      fileName: file.filename,
      fileUrl: `/uploads/production-logs/${file.filename}`,
      mimeType: file.mimetype,
      size: file.size
    }
  });

  const updatedLog = await findProductionLogById(productionLogId);

  emitEvent("production:logged", updatedLog);
  return attachment;
}

export async function updateProductionLog(id, data) {
  const current = await prisma.productionLog.findUnique({
    where: { id },
    include: {
      workOrderOperation: true
    }
  });

  if (!current) {
    throw new ApiError(404, "Production log not found");
  }

  const workOrder = await prisma.workOrder.findUnique({
    where: { id: current.workOrderId },
    include: {
      operations: {
        orderBy: { sequenceNo: "desc" },
        take: 1
      }
    }
  });

  if (!workOrder) {
    throw new ApiError(404, "Work order not found");
  }

  const finalOperationId = workOrder.operations[0]?.id;
  const logContributesToWorkOrder = !current.workOrderOperationId || current.workOrderOperationId === finalOperationId;
  const producedDelta = data.producedQuantity === undefined ? 0 : data.producedQuantity - current.producedQuantity;
  const scrapDelta = data.scrapQuantity === undefined ? 0 : data.scrapQuantity - current.scrapQuantity;
  const workOrderProducedDelta = logContributesToWorkOrder ? producedDelta : 0;
  const nextProducedQuantity = workOrder.producedQuantity + workOrderProducedDelta;
  const nextScrapQuantity = workOrder.scrapQuantity + scrapDelta;
  const nextOperationProducedQuantity = current.workOrderOperation
    ? current.workOrderOperation.producedQuantity + producedDelta
    : null;
  const nextOperationScrapQuantity = current.workOrderOperation
    ? current.workOrderOperation.scrapQuantity + scrapDelta
    : null;

  if (nextProducedQuantity < 0 || nextScrapQuantity < 0) {
    throw new ApiError(400, "Production totals cannot become negative");
  }

  if (nextOperationProducedQuantity !== null && (nextOperationProducedQuantity < 0 || nextOperationScrapQuantity < 0)) {
    throw new ApiError(400, "Operation production totals cannot become negative");
  }

  if (nextProducedQuantity > workOrder.plannedQuantity) {
    throw new ApiError(400, `Produced quantity exceeds planned quantity (${workOrder.plannedQuantity})`);
  }

  if (nextOperationProducedQuantity !== null && nextOperationProducedQuantity > workOrder.plannedQuantity) {
    throw new ApiError(400, `Operation produced quantity exceeds planned quantity (${workOrder.plannedQuantity})`);
  }

  const result = await prisma.$transaction(async (tx) => {
    const log = await tx.productionLog.update({
      where: { id },
      data: {
        shiftId: data.shiftId,
        producedQuantity: data.producedQuantity,
        scrapQuantity: data.scrapQuantity,
        scrapReason: data.scrapQuantity === 0 ? null : data.scrapReason,
        startedAt: data.startedAt ? new Date(data.startedAt) : undefined,
        endedAt: data.endedAt ? new Date(data.endedAt) : undefined,
        note: data.note
      },
      include: includeRelations
    });

    const workOrder = await tx.workOrder.update({
      where: { id: current.workOrderId },
      data: {
        producedQuantity: { increment: workOrderProducedDelta },
        scrapQuantity: { increment: scrapDelta }
      }
    });

    let operation = null;
    if (current.workOrderOperationId) {
      operation = await tx.workOrderOperation.update({
        where: { id: current.workOrderOperationId },
        data: {
          producedQuantity: { increment: producedDelta },
          scrapQuantity: { increment: scrapDelta }
        }
      });
    }

    return { log, workOrder, operation };
  });

  emitEvent("production:logged", result.log);
  emitEvent("workOrder:updated", result.workOrder);
  if (result.operation) {
    emitEvent("workOrderOperation:updated", result.operation);
  }
  return result.log;
}
