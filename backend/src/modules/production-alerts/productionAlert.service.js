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
  resolvedBy: { select: userSelect },
  events: {
    include: {
      actor: { select: userSelect }
    },
    orderBy: { createdAt: "asc" }
  }
};

export function findProductionAlerts({ status } = {}) {
  return prisma.productionAlert.findMany({
    where: status ? { status } : undefined,
    include: includeRelations,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }]
  });
}

export async function createProductionAlert(tx, { productionLog, actor, title, message, severity = "WARNING", assignedToId = null }) {
  const alert = await tx.productionAlert.create({
    data: {
      productionLogId: productionLog.id,
      workOrderId: productionLog.workOrderId,
      createdById: actor.id,
      assignedToId,
      title,
      message,
      severity
    },
  });

  await tx.productionAlertEvent.create({
    data: {
      alertId: alert.id,
      actorId: actor.id,
      type: "CREATED",
      toStatus: "OPEN",
      note: message
    }
  });

  return tx.productionAlert.findUnique({
    where: { id: alert.id },
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

  const alert = await prisma.$transaction(async (tx) => {
    const updated = await tx.productionAlert.update({
      where: { id },
      data: {
        status,
        assignedToId: data.assignedToId,
        resolutionNote: data.resolutionNote,
        resolvedById: isResolved ? actor.id : null,
        resolvedAt: isResolved ? new Date() : null
      }
    });

    const statusChanged = status !== current.status;
    const assignmentChanged = data.assignedToId !== undefined && data.assignedToId !== current.assignedToId;

    if (statusChanged || data.resolutionNote || assignmentChanged) {
      await tx.productionAlertEvent.create({
        data: {
          alertId: id,
          actorId: actor.id,
          type: isResolved ? "RESOLVED" : assignmentChanged ? "ASSIGNED" : "STATUS_CHANGED",
          fromStatus: current.status,
          toStatus: status,
          note: data.resolutionNote
        }
      });
    }

    return tx.productionAlert.findUnique({
      where: { id: updated.id },
      include: includeRelations
    });
  });

  emitEvent("productionAlert:updated", alert);
  return alert;
}
