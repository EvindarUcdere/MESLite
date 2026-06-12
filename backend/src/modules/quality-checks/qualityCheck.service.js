import { prisma } from "../../config/db.js";
import { emitEvent } from "../../config/socket.js";
import { ApiError } from "../../utils/ApiError.js";
import { recordAuditLog } from "../audit-logs/auditLog.service.js";
import { createNotificationsForRoles } from "../notifications/notification.service.js";
import { createProductionAlert } from "../production-alerts/productionAlert.service.js";

const includeRelations = {
  workOrder: {
    include: {
      product: true,
      operations: {
        include: {
          routeOperation: true,
          machine: true,
          assignedOperator: { select: { id: true, name: true, email: true, role: true } },
          productionLogs: {
            include: {
              operator: { select: { id: true, name: true, email: true, role: true } },
              machine: true,
              attachments: true
            },
            orderBy: { createdAt: "desc" },
            take: 5
          },
          messages: {
            include: {
              sender: { select: { id: true, name: true, email: true, role: true } }
            },
            orderBy: { createdAt: "desc" },
            take: 5
          },
          downtimes: {
            include: {
              shift: true,
              operator: { select: { id: true, name: true, email: true, role: true } }
            },
            orderBy: { startedAt: "desc" },
            take: 5
          }
        },
        orderBy: { sequenceNo: "asc" }
      }
    }
  },
  workOrderOperation: {
    include: {
      routeOperation: true,
      machine: true,
      assignedOperator: { select: { id: true, name: true, email: true, role: true } }
    }
  },
  checkedBy: { select: { id: true, name: true, email: true, role: true } }
};

function minutesBetween(start, end) {
  if (!start || !end) {
    return 0;
  }

  return Math.max(Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000), 0);
}

function sumDowntimeMinutes(downtimes, fallbackEnd) {
  return downtimes.reduce((sum, downtime) => sum + minutesBetween(downtime.startedAt, downtime.endedAt ?? fallbackEnd), 0);
}

function getOperationTimeMetrics(operation) {
  const plannedMinutes = operation.routeOperation?.estimatedMinutes ?? 0;
  const actualMinutes = minutesBetween(operation.startedAt, operation.completedAt ?? new Date());
  const downtimeMinutes = sumDowntimeMinutes(operation.downtimes ?? [], operation.completedAt ?? new Date());
  const netMinutes = Math.max(actualMinutes - downtimeMinutes, 0);
  const delayMinutes = plannedMinutes > 0 ? Math.max(netMinutes - plannedMinutes, 0) : 0;

  return {
    plannedMinutes,
    actualMinutes,
    downtimeMinutes,
    netMinutes,
    delayMinutes
  };
}

function getRelationToQuality(operation, checkedOperation) {
  if (!checkedOperation) {
    return "UNKNOWN";
  }

  if (operation.id === checkedOperation.id) {
    return "CHECKED_OPERATION";
  }

  return operation.sequenceNo < checkedOperation.sequenceNo ? "BEFORE_CHECK" : "AFTER_CHECK";
}

function getOperationSignals(operation, metrics, relationToQuality) {
  const signals = [];

  if (operation.scrapQuantity > 0) {
    signals.push({ type: "SCRAP", label: "Fire kaydı", severity: "WARNING", detail: `${operation.scrapQuantity} fire` });
  }

  if (metrics.delayMinutes > 0) {
    signals.push({ type: "DELAY", label: "Sure gecikmesi", severity: "WARNING", detail: `${metrics.delayMinutes} dk gecikme` });
  }

  if ((operation.downtimes ?? []).length > 0) {
    const activeDowntime = operation.downtimes.some((downtime) => !downtime.endedAt);
    signals.push({
      type: "DOWNTIME",
      label: activeDowntime ? "Açık duruş" : "Duruş kaydı",
      severity: activeDowntime ? "CRITICAL" : "WARNING",
      detail: `${metrics.downtimeMinutes} dk durus`
    });
  }

  const qualityMessages = (operation.messages ?? []).filter((message) => ["QUALITY_ALERT", "STOPPAGE", "WARNING"].includes(message.severity));
  for (const message of qualityMessages.slice(0, 2)) {
    signals.push({ type: "MESSAGE", label: message.severity, severity: message.severity === "QUALITY_ALERT" ? "CRITICAL" : "WARNING", detail: message.message });
  }

  if (relationToQuality === "CHECKED_OPERATION") {
    signals.push({ type: "CHECKPOINT", label: "Kalite kontrol noktası", severity: "INFO", detail: "Kalite kaydı bu operasyon üzerinden girildi" });
  }

  return signals;
}

function getImpactLevel(check, signals, relationToQuality) {
  if (relationToQuality === "AFTER_CHECK") {
    return "NEUTRAL";
  }

  if (["FAILED", "PARTIAL"].includes(check.status) && signals.some((signal) => signal.severity === "CRITICAL" || signal.type === "SCRAP")) {
    return "HIGH";
  }

  if (signals.some((signal) => signal.severity === "WARNING" || signal.severity === "CRITICAL")) {
    return "MEDIUM";
  }

  return "LOW";
}

function buildQualityTraceability(check) {
  const checkedOperation = check.workOrderOperation;
  const routeOperations = (check.workOrder?.operations ?? []).map((operation) => {
    const metrics = getOperationTimeMetrics(operation);
    const relationToQuality = getRelationToQuality(operation, checkedOperation);
    const signals = getOperationSignals(operation, metrics, relationToQuality);

    return {
      id: operation.id,
      sequenceNo: operation.sequenceNo,
      operationName: operation.operationName,
      status: operation.status,
      relationToQuality,
      machine: operation.machine,
      assignedOperator: operation.assignedOperator,
      producedQuantity: operation.producedQuantity,
      scrapQuantity: operation.scrapQuantity,
      startedAt: operation.startedAt,
      completedAt: operation.completedAt,
      metrics,
      signals,
      impactLevel: getImpactLevel(check, signals, relationToQuality),
      productionLogs: operation.productionLogs ?? [],
      messages: operation.messages ?? [],
      downtimes: operation.downtimes ?? []
    };
  });

  const suspectOperations = routeOperations.filter((operation) => ["HIGH", "MEDIUM"].includes(operation.impactLevel) && operation.relationToQuality !== "AFTER_CHECK");
  const totalDowntimeMinutes = routeOperations.reduce((sum, operation) => sum + operation.metrics.downtimeMinutes, 0);
  const totalDelayMinutes = routeOperations.reduce((sum, operation) => sum + operation.metrics.delayMinutes, 0);

  return {
    workOrder: {
      id: check.workOrder.id,
      orderNo: check.workOrder.orderNo,
      status: check.workOrder.status,
      plannedQuantity: check.workOrder.plannedQuantity,
      producedQuantity: check.workOrder.producedQuantity,
      scrapQuantity: check.workOrder.scrapQuantity,
      product: check.workOrder.product
    },
    checkedOperation: checkedOperation
      ? {
          id: checkedOperation.id,
          sequenceNo: checkedOperation.sequenceNo,
          operationName: checkedOperation.operationName,
          machine: checkedOperation.machine,
          assignedOperator: checkedOperation.assignedOperator
        }
      : null,
    totals: {
      operationCount: routeOperations.length,
      suspectOperationCount: suspectOperations.length,
      totalDowntimeMinutes,
      totalDelayMinutes
    },
    suspectOperations: suspectOperations.map((operation) => ({
      id: operation.id,
      sequenceNo: operation.sequenceNo,
      operationName: operation.operationName,
      impactLevel: operation.impactLevel,
      machine: operation.machine,
      assignedOperator: operation.assignedOperator,
      signals: operation.signals
    })),
    routeOperations
  };
}

function withTraceability(check) {
  if (!check) {
    return check;
  }

  return {
    ...check,
    traceability: buildQualityTraceability(check)
  };
}

async function findQualityActionOwner(tx) {
  const productionManager = await tx.user.findFirst({
    where: { role: "PRODUCTION_MANAGER", isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true }
  });

  if (productionManager) {
    return productionManager;
  }

  return tx.user.findFirst({
    where: { role: "ADMIN", isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true }
  });
}

async function createQualityActionIfNeeded(tx, { actor, workOrder, selectedOperation, qualityCheck }) {
  if (!["FAILED", "PARTIAL"].includes(qualityCheck.status) || !selectedOperation?.id) {
    return null;
  }

  const productionLog = await tx.productionLog.findFirst({
    where: {
      workOrderId: workOrder.id,
      workOrderOperationId: selectedOperation.id
    },
    orderBy: { createdAt: "desc" }
  });

  if (!productionLog) {
    return null;
  }

  const owner = await findQualityActionOwner(tx);
  const severity = qualityCheck.status === "FAILED" ? "CRITICAL" : "WARNING";
  const title = `Kalite uygunsuzlugu - ${workOrder.orderNo}`;
  const message = [
    `${selectedOperation.sequenceNo}. ${selectedOperation.operationName} operasyonunda kalite sonucu ${qualityCheck.status}.`,
    `Hatali adet: ${qualityCheck.defectQuantity}.`,
    qualityCheck.defectReason ? `Neden: ${qualityCheck.defectReason}.` : null,
    qualityCheck.note ? `Not: ${qualityCheck.note}` : null
  ]
    .filter(Boolean)
    .join(" ");

  const alert = await createProductionAlert(tx, {
    productionLog,
    actor,
    title,
    message,
    severity,
    assignedToId: owner?.id ?? null
  });

  await createNotificationsForRoles(
    ["ADMIN", "PRODUCTION_MANAGER", "QUALITY_STAFF"],
    {
      type: "QUALITY_NONCONFORMITY",
      title: "Kalite uygunsuzlugu aksiyonu",
      message: `${workOrder.orderNo}: ${qualityCheck.defectReason ?? qualityCheck.status}`,
      entityType: "ProductionAlert",
      entityId: alert.id,
      metadata: {
        workOrderId: workOrder.id,
        orderNo: workOrder.orderNo,
        workOrderOperationId: selectedOperation.id,
        operationName: selectedOperation.operationName,
        qualityCheckId: qualityCheck.id,
        defectQuantity: qualityCheck.defectQuantity,
        defectReason: qualityCheck.defectReason,
        status: qualityCheck.status
      }
    },
    tx
  );

  return alert;
}

export async function findQualityChecks() {
  const checks = await prisma.qualityCheck.findMany({
    include: includeRelations,
    orderBy: { checkedAt: "desc" }
  });

  return checks.map(withTraceability);
}

export async function findQualityCheckById(id) {
  const check = await prisma.qualityCheck.findUnique({
    where: { id },
    include: includeRelations
  });

  return withTraceability(check);
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

  const result = await prisma.$transaction(async (tx) => {
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

    const alert = await createQualityActionIfNeeded(tx, {
      actor,
      workOrder,
      selectedOperation,
      qualityCheck: created
    });

    return { qualityCheck: created, alert };
  });

  emitEvent("quality:checked", result.qualityCheck);
  if (result.alert) {
    emitEvent("productionAlert:created", result.alert);
  }
  return withTraceability(result.qualityCheck);
}

export async function updateQualityCheck(actor, id, data) {
  const current = await prisma.qualityCheck.findUnique({
    where: { id },
    include: { workOrder: true }
  });

  if (!current) {
    throw new ApiError(404, "Quality check not found");
  }

  const qualityCheck = await prisma.$transaction(async (tx) => {
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

  return withTraceability(qualityCheck);
}


