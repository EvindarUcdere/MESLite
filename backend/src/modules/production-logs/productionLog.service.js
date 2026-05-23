import { prisma } from "../../config/db.js";
import { emitEvent } from "../../config/socket.js";
import { ApiError } from "../../utils/ApiError.js";

const includeRelations = {
  workOrder: { include: { product: true } },
  operator: { select: { id: true, name: true, email: true, role: true } },
  machine: true,
  shift: true
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

export async function createProductionLog(operatorId, data) {
  if (data.producedQuantity === 0 && data.scrapQuantity === 0) {
    throw new ApiError(400, "Produced or scrap quantity must be greater than zero");
  }

  const result = await prisma.$transaction(async (tx) => {
    const log = await tx.productionLog.create({
      data: {
        workOrderId: data.workOrderId,
        operatorId,
        machineId: data.machineId,
        shiftId: data.shiftId,
        producedQuantity: data.producedQuantity,
        scrapQuantity: data.scrapQuantity,
        startedAt: data.startedAt ? new Date(data.startedAt) : undefined,
        endedAt: data.endedAt ? new Date(data.endedAt) : undefined,
        note: data.note
      },
      include: includeRelations
    });

    const workOrder = await tx.workOrder.update({
      where: { id: data.workOrderId },
      data: {
        producedQuantity: { increment: data.producedQuantity },
        scrapQuantity: { increment: data.scrapQuantity }
      }
    });

    return { log, workOrder };
  });

  emitEvent("production:logged", result.log);
  emitEvent("workOrder:updated", result.workOrder);
  return result.log;
}

export async function updateProductionLog(id, data) {
  const current = await prisma.productionLog.findUnique({ where: { id } });

  if (!current) {
    throw new ApiError(404, "Production log not found");
  }

  const producedDelta = data.producedQuantity === undefined ? 0 : data.producedQuantity - current.producedQuantity;
  const scrapDelta = data.scrapQuantity === undefined ? 0 : data.scrapQuantity - current.scrapQuantity;

  const result = await prisma.$transaction(async (tx) => {
    const log = await tx.productionLog.update({
      where: { id },
      data: {
        shiftId: data.shiftId,
        producedQuantity: data.producedQuantity,
        scrapQuantity: data.scrapQuantity,
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
