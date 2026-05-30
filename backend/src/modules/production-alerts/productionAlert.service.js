import { prisma } from "../../config/db.js";
import { emitEvent } from "../../config/socket.js";
import { ApiError } from "../../utils/ApiError.js";

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true
};

export const includeRelations = {
  workOrder: { include: { product: true } },
  productionLog: {
    include: {
      machine: true,
      attachments: true,
      operator: {
        select: userSelect
      }
    }
  },
  createdBy: { select: userSelect },
  assignedTo: { select: userSelect },
  resolvedBy: { select: userSelect }
};

export function findProductionAlerts({ status } = {}) {
  return prisma.productionAlert.findMany({
    where: status ? { status } : undefined,
    include: includeRelations,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }]
  });
}

export async function createProductionAlert(tx, { productionLog, actor, title, message, severity = "WARNING" }) {
  return tx.productionAlert.create({
    data: {
      productionLogId: productionLog.id,
      workOrderId: productionLog.workOrderId,
      createdById: actor.id,
      title,
      message,
      severity
    },
    include: includeRelations
  });
}

export async function updateProductionAlert(actor, id, data) {
  const current = await prisma.productionAlert.findUnique({ where: { id } });

  if (!current) {
    throw new ApiError(404, "Production alert not found");
  }

  const status = data.status ?? current.status;
  const isResolved = status === "RESOLVED";

  const alert = await prisma.productionAlert.update({
    where: { id },
    data: {
      status,
      assignedToId: data.assignedToId,
      resolutionNote: data.resolutionNote,
      resolvedById: isResolved ? actor.id : null,
      resolvedAt: isResolved ? new Date() : null
    },
    include: includeRelations
  });

  emitEvent("productionAlert:updated", alert);
  return alert;
}
