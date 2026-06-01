import { prisma } from "../../config/db.js";
import { emitEvent } from "../../config/socket.js";
import { ApiError } from "../../utils/ApiError.js";

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

export async function createQualityCheck(checkedById, data) {
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

  const qualityCheck = await prisma.qualityCheck.create({
    data: {
      workOrderId: data.workOrderId,
      workOrderOperationId: data.workOrderOperationId,
      checkedById,
      status: data.status,
      defectQuantity: data.defectQuantity,
      defectReason: data.defectReason,
      note: data.note,
      checkedAt: data.checkedAt ? new Date(data.checkedAt) : undefined
    },
    include: includeRelations
  });

  emitEvent("quality:checked", qualityCheck);
  return qualityCheck;
}

export function updateQualityCheck(id, data) {
  return prisma.qualityCheck.update({
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
}
