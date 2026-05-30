import { prisma } from "../../config/db.js";
import { emitEvent } from "../../config/socket.js";
import { ApiError } from "../../utils/ApiError.js";

const includeRelations = {
  workOrder: { include: { product: true } },
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
  if (data.producedQuantity === 0 && data.scrapQuantity === 0) {
    throw new ApiError(400, "Produced or scrap quantity must be greater than zero");
  }

  const result = await prisma.$transaction(async (tx) => {
    const workOrder = await tx.workOrder.findUnique({ where: { id: data.workOrderId } });

    if (!workOrder) {
      throw new ApiError(404, "Work order not found");
    }

    if (workOrder.status !== "IN_PROGRESS") {
      throw new ApiError(400, "Production can only be logged for in-progress work orders");
    }

    if (!workOrder.machineId || workOrder.machineId !== data.machineId) {
      throw new ApiError(400, "Production log machine must match the work order machine");
    }

    if (actor.role === "OPERATOR" && workOrder.assignedOperatorId !== actor.id) {
      throw new ApiError(403, "Operator can only log production for assigned work orders");
    }

    const remainingQuantity = workOrder.plannedQuantity - workOrder.producedQuantity;

    if (data.producedQuantity > remainingQuantity) {
      throw new ApiError(400, `Produced quantity exceeds remaining planned quantity (${remainingQuantity})`);
    }

    const operatorId = actor.role === "OPERATOR" ? actor.id : workOrder.assignedOperatorId;

    if (!operatorId) {
      throw new ApiError(400, "Assigned operator is required before logging production");
    }

    const log = await tx.productionLog.create({
      data: {
        workOrderId: data.workOrderId,
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

    const updatedWorkOrder = await tx.workOrder.update({
      where: { id: data.workOrderId },
      data: {
        producedQuantity: { increment: data.producedQuantity },
        scrapQuantity: { increment: data.scrapQuantity }
      }
    });

    return { log, workOrder: updatedWorkOrder };
  });

  emitEvent("production:logged", result.log);
  emitEvent("workOrder:updated", result.workOrder);
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
  const current = await prisma.productionLog.findUnique({ where: { id } });

  if (!current) {
    throw new ApiError(404, "Production log not found");
  }

  const workOrder = await prisma.workOrder.findUnique({ where: { id: current.workOrderId } });

  if (!workOrder) {
    throw new ApiError(404, "Work order not found");
  }

  const producedDelta = data.producedQuantity === undefined ? 0 : data.producedQuantity - current.producedQuantity;
  const scrapDelta = data.scrapQuantity === undefined ? 0 : data.scrapQuantity - current.scrapQuantity;
  const nextProducedQuantity = workOrder.producedQuantity + producedDelta;
  const nextScrapQuantity = workOrder.scrapQuantity + scrapDelta;

  if (nextProducedQuantity < 0 || nextScrapQuantity < 0) {
    throw new ApiError(400, "Production totals cannot become negative");
  }

  if (nextProducedQuantity > workOrder.plannedQuantity) {
    throw new ApiError(400, `Produced quantity exceeds planned quantity (${workOrder.plannedQuantity})`);
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
        producedQuantity: { increment: producedDelta },
        scrapQuantity: { increment: scrapDelta }
      }
    });

    return { log, workOrder };
  });

  emitEvent("production:logged", result.log);
  emitEvent("workOrder:updated", result.workOrder);
  return result.log;
}
