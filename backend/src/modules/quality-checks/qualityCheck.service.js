import { prisma } from "../../config/db.js";
import { emitEvent } from "../../config/socket.js";

const includeRelations = {
  workOrder: { include: { product: true } },
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
  const qualityCheck = await prisma.qualityCheck.create({
    data: {
      workOrderId: data.workOrderId,
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
      status: data.status,
      defectQuantity: data.defectQuantity,
      defectReason: data.defectReason,
      note: data.note,
      checkedAt: data.checkedAt ? new Date(data.checkedAt) : undefined
    },
    include: includeRelations
  });
}
