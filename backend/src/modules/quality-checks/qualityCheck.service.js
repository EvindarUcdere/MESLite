import { prisma } from "../../config/db.js";
import { emitEvent } from "../../config/socket.js";
import { ApiError } from "../../utils/ApiError.js";
import { recordAuditLog } from "../audit-logs/auditLog.service.js";

const includeRelations = {
  workOrder: { include: { product: true } },
  workOrderOperation: {
    include: {
      machine: true,
      assignedOperator: { select: { id: true, name: true, email: true, role: true } }
    }
  },
  checkedBy: { select: { id: true, name: true, email: true, role: true } }
};

export function findQualityChecks() {
  return prisma.qualityCheck.findMany({
    include: includeRelations,
    orderBy: { checkedAt: "desc" }
  });
}

export function findQualityCheckById(id) {
  return prisma.qualityCheck.findUnique({
    where: { id },
    include: includeRelations
  });
}

export async function createQualityCheck(actor, data) {
  const workOrder = await prisma.workOrder.findUnique({
    where: { id: data.workOrderId },
    include: {
      operations: true
    }
  });

  if (!workOrder) {
    throw new ApiError(404, "Work order not found");
  }

  const selectedOperation = data.workOrderOperationId
    ? workOrder.operations.find((operation) => operation.id === data.workOrderOperationId)
    : null;

  if (data.workOrderOperationId && !selectedOperation) {
    throw new ApiError(400, "Selected operation must belong to the selected work order");
  }

  if (workOrder.operations.length && !data.workOrderOperationId) {
    throw new ApiError(400, "Operation is required for routed work order quality checks");
  }

  if (workOrder.producedQuantity <= 0) {
    throw new ApiError(400, "Quality check requires production quantity");
  }

  const producedQuantity = selectedOperation?.producedQuantity ?? workOrder.producedQuantity;

  if (producedQuantity <= 0) {
    throw new ApiError(400, "Quality check requires production quantity for selected operation");
  }

  if (data.defectQuantity > producedQuantity) {
    throw new ApiError(400, "Defect quantity cannot exceed produced quantity");
  }

  if (["FAILED", "PARTIAL"].includes(data.status) && !data.defectReason?.trim()) {
    throw new ApiError(400, "Defect reason is required for failed or partial quality checks");
  }

  const qualityCheck = await prisma.$transaction(async (tx) => {
    const created = await tx.qualityCheck.create({
      data: {
        workOrderId: data.workOrderId,
        workOrderOperationId: data.workOrderOperationId,
        checkedById: actor.id,
        status: data.status,
        defectQuantity: data.defectQuantity,
        defectReason: data.defectReason,
        note: data.note,
        checkedAt: data.checkedAt ? new Date(data.checkedAt) : undefined
      },
      include: includeRelations
    });

    await recordAuditLog(
      {
        actorId: actor.id,
        action: "QUALITY_CHECK_CREATED",
        entityType: "QualityCheck",
        entityId: created.id,
        summary: `${workOrder.orderNo} için kalite sonucu kaydedildi (${created.status})`,
        metadata: {
          workOrderId: data.workOrderId,
          workOrderOperationId: data.workOrderOperationId,
          orderNo: workOrder.orderNo,
          status: created.status,
          defectQuantity: created.defectQuantity,
          defectReason: created.defectReason
        }
      },
      tx
    );

    return created;
  });

  emitEvent("quality:checked", qualityCheck);
  return qualityCheck;
}

export async function updateQualityCheck(actor, id, data) {
  const current = await prisma.qualityCheck.findUnique({
    where: { id },
    include: { workOrder: true }
  });

  if (!current) {
    throw new ApiError(404, "Quality check not found");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.qualityCheck.update({
      where: { id },
      data: {
        workOrderOperationId: data.workOrderOperationId,
        status: data.status,
        defectQuantity: data.defectQuantity,
        defectReason: data.defectReason,
        note: data.note,
        checkedAt: data.checkedAt ? new Date(data.checkedAt) : undefined
      },
      include: includeRelations
    });

    await recordAuditLog(
      {
        actorId: actor?.id,
        action: "QUALITY_CHECK_UPDATED",
        entityType: "QualityCheck",
        entityId: updated.id,
        summary: `${current.workOrder.orderNo} kalite sonucu güncellendi`,
        metadata: {
          workOrderId: current.workOrderId,
          workOrderOperationId: updated.workOrderOperationId,
          previousStatus: current.status,
          nextStatus: updated.status,
          previousDefectQuantity: current.defectQuantity,
          nextDefectQuantity: updated.defectQuantity
        }
      },
      tx
    );

    return updated;
  });
}
