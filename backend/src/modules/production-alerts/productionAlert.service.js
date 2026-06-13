import { prisma } from "../../config/db.js";
import { emitEvent } from "../../config/socket.js";
import { ApiError } from "../../utils/ApiError.js";
import { recordAuditLog } from "../audit-logs/auditLog.service.js";
import { createNotification } from "../notifications/notification.service.js";

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true
};

export const includeRelations = {
  workOrder: {
    include: {
      product: true,
      operations: {
        include: {
          machine: true,
          assignedOperator: { select: userSelect }
        },
        orderBy: { sequenceNo: "asc" }
      }
    }
  },
  productionLog: {
    include: {
      machine: true,
      attachments: true,
      workOrderOperation: true,
      operator: {
        select: userSelect
      }
    }
  },
  createdBy: { select: userSelect },
  assignedTo: { select: userSelect },
  resolvedBy: { select: userSelect },
  reworkOperation: {
    include: {
      machine: true,
      assignedOperator: { select: userSelect }
    }
  },
  events: {
    include: {
      actor: { select: userSelect }
    },
    orderBy: { createdAt: "asc" }
  }
};

async function getAlertOrThrow(id, tx = prisma) {
  const alert = await tx.productionAlert.findUnique({
    where: { id },
    include: includeRelations
  });

  if (!alert) {
    throw new ApiError(404, "Üretim uyarısı bulunamadı");
  }

  return alert;
}

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
  const current = await getAlertOrThrow(id);

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

export async function decideQualityAction(actor, id, data) {
  const current = await getAlertOrThrow(id);

  if (current.status === "RESOLVED") {
    throw new ApiError(400, "Resolved alerts cannot receive a new quality action");
  }

  const isQualityAlert = current.title.toLocaleLowerCase("tr-TR").includes("kalite");
  if (!isQualityAlert) {
    throw new ApiError(400, "Kalite aksiyonu yalnızca kalite uyarıları için oluşturulabilir");
  }

  const decisionNote = data.note.trim();

  const result = await prisma.$transaction(async (tx) => {
    let targetOperation = null;
    let workOrder = null;

    if (data.decision === "REWORK_OPERATION") {
      targetOperation = await tx.workOrderOperation.findUnique({
        where: { id: data.reworkOperationId },
        include: {
          workOrder: { include: { product: true, route: true } },
          machine: true,
          assignedOperator: { select: userSelect }
        }
      });

      if (!targetOperation || targetOperation.workOrderId !== current.workOrderId) {
        throw new ApiError(400, "Geri işleme operasyonu uyarının iş emrine ait olmalıdır");
      }

      if (current.workOrder.status === "COMPLETED" || current.workOrder.status === "CANCELLED") {
        throw new ApiError(400, "Completed or cancelled work orders cannot receive rework action");
      }

      targetOperation = await tx.workOrderOperation.update({
        where: { id: targetOperation.id },
        data: {
          status: ["READY", "IN_PROGRESS", "PAUSED"].includes(targetOperation.status) ? targetOperation.status : "READY",
          completedAt: null
        },
        include: {
          workOrder: { include: { product: true, route: true } },
          machine: true,
          assignedOperator: { select: userSelect }
        }
      });

      await tx.operationMessage.create({
        data: {
          workOrderOperationId: targetOperation.id,
          senderId: actor.id,
          severity: "QUALITY_ALERT",
          message: `Kalite aksiyonu: ${decisionNote}`
        }
      });

      if (targetOperation.assignedOperatorId) {
        await createNotification(
          {
            recipientId: targetOperation.assignedOperatorId,
            type: "QUALITY_REWORK_ASSIGNED",
            title: "Kalite geri isleme aksiyonu",
            message: `${current.workOrder.orderNo} / ${targetOperation.operationName}: ${decisionNote}`,
            entityType: "WorkOrderOperation",
            entityId: targetOperation.id,
            metadata: {
              alertId: current.id,
              workOrderId: current.workOrderId,
              orderNo: current.workOrder.orderNo,
              operationName: targetOperation.operationName,
              decision: data.decision
            }
          },
          tx
        );
      }

      workOrder = await tx.workOrder.update({
        where: { id: current.workOrderId },
        data: { status: "IN_PROGRESS", actualEndDate: null },
        include: {
          product: true,
          route: true,
          machine: true,
          assignedOperator: { select: userSelect },
          operations: {
            include: {
              machine: true,
              assignedOperator: { select: userSelect },
              routeOperation: true,
              messages: {
                include: { sender: { select: userSelect } },
                orderBy: { createdAt: "desc" },
                take: 5
              },
              downtimes: {
                include: {
                  shift: true,
                  operator: { select: userSelect }
                },
                orderBy: { startedAt: "desc" },
                take: 5
              },
              _count: { select: { productionLogs: true } }
            },
            orderBy: { sequenceNo: "asc" }
          }
        }
      });
    }

    const isResolvedDecision = ["SCRAP", "CONDITIONAL_ACCEPT"].includes(data.decision);
    const updatedAlert = await tx.productionAlert.update({
      where: { id },
      data: {
        status: isResolvedDecision ? "RESOLVED" : "IN_REVIEW",
        qualityDecision: data.decision,
        qualityDecisionNote: decisionNote,
        reworkOperationId: data.decision === "REWORK_OPERATION" ? targetOperation.id : null,
        resolutionNote: isResolvedDecision ? decisionNote : current.resolutionNote,
        resolvedById: isResolvedDecision ? actor.id : null,
        resolvedAt: isResolvedDecision ? new Date() : null
      },
      include: includeRelations
    });

    await tx.productionAlertEvent.create({
      data: {
        alertId: id,
        actorId: actor.id,
        type: isResolvedDecision ? "RESOLVED" : "COMMENT",
        fromStatus: current.status,
        toStatus: updatedAlert.status,
        note: `Kalite karari: ${data.decision}. ${decisionNote}`
      }
    });

    const alert = await tx.productionAlert.findUnique({
      where: { id: updatedAlert.id },
      include: includeRelations
    });

    await recordAuditLog(
      {
        actorId: actor.id,
        action: "QUALITY_ACTION_DECIDED",
        entityType: "ProductionAlert",
        entityId: updatedAlert.id,
        summary: `${current.workOrder.orderNo} kalite aksiyonu: ${data.decision}`,
        metadata: {
          alertId: updatedAlert.id,
          workOrderId: current.workOrderId,
          decision: data.decision,
          reworkOperationId: targetOperation?.id ?? null,
          note: decisionNote
        }
      },
      tx
    );

    return { alert, targetOperation, workOrder };
  });

  emitEvent("productionAlert:updated", result.alert);
  if (result.targetOperation) {
    emitEvent("workOrderOperation:updated", result.targetOperation);
  }
  if (result.workOrder) {
    emitEvent("workOrder:updated", result.workOrder);
  }

  return result.alert;
}
