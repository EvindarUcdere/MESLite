import { prisma } from "../../config/db.js";
import { emitEvent } from "../../config/socket.js";
import { ApiError } from "../../utils/ApiError.js";
import { recordAuditLog } from "../audit-logs/auditLog.service.js";
import { createNotificationsForRoles } from "../notifications/notification.service.js";
import { createProductionAlert } from "../production-alerts/productionAlert.service.js";

const includeRelations = {
  workOrder: { include: { product: true } },
  workOrderOperation: true,
  operator: { select: { id: true, name: true, email: true, role: true } },
  machine: true,
  shift: true,
  attachments: true
};

const workOrderEmitInclude = {
  product: true,
  route: {
    include: {
      operations: {
        include: {
          defaultMachine: true
        },
        orderBy: { sequenceNo: "asc" }
      }
    }
  },
  machine: true,
  assignedOperator: {
    select: { id: true, name: true, email: true, role: true }
  },
  createdBy: {
    select: { id: true, name: true, email: true, role: true }
  },
  productionLogs: {
    include: {
      operator: {
        select: { id: true, name: true, email: true, role: true }
      },
      machine: true,
      workOrderOperation: true,
      attachments: true
    },
    orderBy: { createdAt: "desc" },
    take: 5
  },
  operations: {
    include: {
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
      downtimes: {
        include: {
          shift: true,
          operator: {
            select: { id: true, name: true, email: true, role: true }
          }
        },
        orderBy: { startedAt: "desc" },
        take: 5
      },
      _count: {
        select: {
          productionLogs: true
        }
      }
    },
    orderBy: { sequenceNo: "asc" }
  }
};

function timeToMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function isTimeInShift(nowMinutes, shift) {
  const startMinutes = timeToMinutes(shift.startTime);
  const endMinutes = timeToMinutes(shift.endTime);

  if (startMinutes === endMinutes) {
    return true;
  }

  if (startMinutes < endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  }

  return nowMinutes >= startMinutes || nowMinutes < endMinutes;
}

async function findShiftIdForLog(tx, explicitShiftId, date = new Date()) {
  if (explicitShiftId) {
    return explicitShiftId;
  }

  const shifts = await tx.shift.findMany({
    where: { isActive: true },
    orderBy: { startTime: "asc" }
  });

  const nowMinutes = date.getHours() * 60 + date.getMinutes();
  const activeShift = shifts.filter((shift) => isTimeInShift(nowMinutes, shift)).at(-1);

  return activeShift?.id;
}

function getOperationTransferQuantity(operation, previousOperation, workOrder) {
  if (!operation) {
    return workOrder.plannedQuantity;
  }

  if (!previousOperation) {
    return workOrder.plannedQuantity;
  }

  return Math.max(previousOperation.producedQuantity, 0);
}

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
    throw new ApiError(400, "Üretim ve fire adedi sıfırsa not girmek zorunludur");
  }

  const result = await prisma.$transaction(async (tx) => {
    const operation = data.workOrderOperationId
      ? await tx.workOrderOperation.findUnique({
          where: { id: data.workOrderOperationId },
          include: { workOrder: true }
        })
      : null;

    if (data.workOrderOperationId && !operation) {
      throw new ApiError(404, "İş emri operasyonu bulunamadı");
    }

    if (operation && operation.workOrderId !== data.workOrderId) {
      throw new ApiError(400, "Üretim kaydı operasyonu seçilen iş emrine ait olmalıdır");
    }

    const workOrder = operation?.workOrder ?? (await tx.workOrder.findUnique({ where: { id: data.workOrderId } }));

    if (!workOrder) {
      throw new ApiError(404, "İş emri bulunamadı");
    }

    const allowedWorkOrderStatuses = operation ? ["PLANNED", "IN_PROGRESS", "PAUSED"] : ["IN_PROGRESS"];

    if (!allowedWorkOrderStatuses.includes(workOrder.status)) {
      throw new ApiError(400, "Üretim girişi yalnızca üretimdeki iş emirleri için yapılabilir");
    }

    if (operation) {
      if (!["READY", "IN_PROGRESS", "PAUSED"].includes(operation.status)) {
        throw new ApiError(400, "Üretim girişi yalnızca hazır, üretimde veya duraklatılmış operasyonlar için yapılabilir");
      }

      if (!operation.machineId || operation.machineId !== data.machineId) {
        throw new ApiError(400, "Üretim kaydındaki makine operasyon makinesiyle eşleşmelidir");
      }

      if (actor.role === "OPERATOR" && operation.assignedOperatorId !== actor.id) {
        throw new ApiError(403, "Operatör yalnızca kendisine atanmış operasyonlar için üretim girişi yapabilir");
      }
    } else if (!workOrder.machineId || workOrder.machineId !== data.machineId) {
      throw new ApiError(400, "Üretim kaydındaki makine iş emri makinesiyle eşleşmelidir");
    }

    if (!operation && actor.role === "OPERATOR" && workOrder.assignedOperatorId !== actor.id) {
      throw new ApiError(403, "Operatör yalnızca kendisine atanmış iş emirleri için üretim girişi yapabilir");
    }

    const previousOperation = operation
      ? await tx.workOrderOperation.findFirst({
          where: {
            workOrderId: operation.workOrderId,
            sequenceNo: { lt: operation.sequenceNo }
          },
          orderBy: { sequenceNo: "desc" }
        })
      : null;
    const transferQuantity = getOperationTransferQuantity(operation, previousOperation, workOrder);
    const remainingQuantity = operation ? transferQuantity - operation.producedQuantity : workOrder.plannedQuantity - workOrder.producedQuantity;
    const remainingProcessQuantity = operation ? transferQuantity - operation.producedQuantity - operation.scrapQuantity : remainingQuantity;

    if (data.producedQuantity > Math.max(remainingQuantity, 0)) {
      throw new ApiError(400, `Produced quantity exceeds transferable remaining quantity (${Math.max(remainingQuantity, 0)})`);
    }

    if (operation && data.producedQuantity + data.scrapQuantity > Math.max(remainingProcessQuantity, 0)) {
      throw new ApiError(400, `Processed quantity exceeds transferable remaining quantity (${Math.max(remainingProcessQuantity, 0)})`);
    }

    const operatorId = actor.role === "OPERATOR" ? actor.id : operation?.assignedOperatorId ?? workOrder.assignedOperatorId;

    if (!operatorId) {
      throw new ApiError(400, "Üretim girişi yapılmadan önce operatör atanmalıdır");
    }

    const shiftId = await findShiftIdForLog(tx, data.shiftId, data.endedAt ? new Date(data.endedAt) : new Date());

    const log = await tx.productionLog.create({
      data: {
        workOrderId: data.workOrderId,
        workOrderOperationId: data.workOrderOperationId,
        operatorId,
        machineId: data.machineId,
        shiftId,
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
        throw new ApiError(400, "Kritik üretim uyarıları için uyarı notu zorunludur");
      }

      alert = await createProductionAlert(tx, {
        productionLog: log,
        actor,
        title: `Operatör uyarısı - ${workOrder.orderNo}`,
        message: data.note,
        severity: data.alertSeverity ?? "WARNING"
      });

      await createNotificationsForRoles(
        ["ADMIN", "PRODUCTION_MANAGER", "QUALITY_STAFF"],
        {
          type: "CRITICAL_PRODUCTION_ALERT",
          title: "Kritik üretim uyarısı",
          message: `${workOrder.orderNo}: ${data.note}`,
          entityType: "ProductionAlert",
          entityId: alert.id,
          metadata: {
            workOrderId: workOrder.id,
            orderNo: workOrder.orderNo,
            productionLogId: log.id,
            severity: data.alertSeverity ?? "WARNING",
            operatorId
          }
        },
        tx
      );
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

    await recordAuditLog(
      {
        actorId: actor.id,
        action: "PRODUCTION_LOG_CREATED",
        entityType: "ProductionLog",
        entityId: log.id,
        summary: `${workOrder.orderNo} için üretim girişi yapıldı (${data.producedQuantity} üretim, ${data.scrapQuantity} fire)`,
        metadata: {
          workOrderId: data.workOrderId,
          workOrderOperationId: data.workOrderOperationId,
          orderNo: workOrder.orderNo,
          machineId: data.machineId,
          producedQuantity: data.producedQuantity,
          scrapQuantity: data.scrapQuantity,
          scrapReason: data.scrapQuantity > 0 ? data.scrapReason : null,
          hasNote: Boolean(data.note?.trim()),
          criticalAlert: Boolean(data.isCriticalAlert),
          transferQuantity,
          remainingQuantity,
          remainingProcessQuantity
        }
      },
      tx
    );

    const fullWorkOrder = await tx.workOrder.findUnique({
      where: { id: updatedWorkOrder.id },
      include: workOrderEmitInclude
    });

    return { log, workOrder: fullWorkOrder ?? updatedWorkOrder, operation: updatedOperation, alert };
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
    throw new ApiError(400, "Görsel dosyası zorunludur");
  }

  const productionLog = await prisma.productionLog.findUnique({
    where: { id: productionLogId },
    include: {
      workOrder: true
    }
  });

  if (!productionLog) {
    throw new ApiError(404, "Üretim kaydı bulunamadı");
  }

  if (actor.role === "OPERATOR" && productionLog.operatorId !== actor.id) {
    throw new ApiError(403, "Operatör yalnızca kendi üretim kayıtlarına görsel ekleyebilir");
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

  await recordAuditLog({
    actorId: actor.id,
    action: "PRODUCTION_ATTACHMENT_ADDED",
    entityType: "ProductionLog",
    entityId: productionLogId,
    summary: `${productionLog.workOrder.orderNo} üretim kaydına görsel kanıt eklendi`,
    metadata: {
      workOrderId: productionLog.workOrderId,
      attachmentId: attachment.id,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      size: attachment.size
    }
  });

  const updatedLog = await findProductionLogById(productionLogId);

  emitEvent("production:logged", updatedLog);
  return attachment;
}

export async function updateProductionLog(actor, id, data) {
  const current = await prisma.productionLog.findUnique({
    where: { id },
    include: {
      workOrderOperation: true
    }
  });

  if (!current) {
    throw new ApiError(404, "Üretim kaydı bulunamadı");
  }

  const workOrder = await prisma.workOrder.findUnique({
    where: { id: current.workOrderId },
    include: {
      operations: {
        orderBy: { sequenceNo: "asc" }
      }
    }
  });

  if (!workOrder) {
    throw new ApiError(404, "İş emri bulunamadı");
  }

  const finalOperationId = workOrder.operations.at(-1)?.id;
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

  const currentOperationIndex = current.workOrderOperationId ? workOrder.operations.findIndex((operation) => operation.id === current.workOrderOperationId) : -1;
  const previousOperation = currentOperationIndex > 0 ? workOrder.operations[currentOperationIndex - 1] : null;
  const operationTransferQuantity =
    currentOperationIndex >= 0 ? getOperationTransferQuantity(workOrder.operations[currentOperationIndex], previousOperation, workOrder) : workOrder.plannedQuantity;

  if (nextOperationProducedQuantity !== null && nextOperationProducedQuantity > operationTransferQuantity) {
    throw new ApiError(400, `Operation produced quantity exceeds transferable quantity (${operationTransferQuantity})`);
  }

  if (nextOperationProducedQuantity !== null && nextOperationProducedQuantity + nextOperationScrapQuantity > operationTransferQuantity) {
    throw new ApiError(400, `Operation processed quantity exceeds transferable quantity (${operationTransferQuantity})`);
  }

  const nextOperation = currentOperationIndex >= 0 ? workOrder.operations[currentOperationIndex + 1] : null;
  if (nextOperation && (producedDelta !== 0 || scrapDelta !== 0)) {
    const updatedCurrentProduced = current.workOrderOperation.producedQuantity + producedDelta;
    const updatedCurrentScrap = current.workOrderOperation.scrapQuantity + scrapDelta;
    const updatedTransferQuantity = Math.max(updatedCurrentProduced - updatedCurrentScrap, 0);

    if (nextOperation.producedQuantity > updatedTransferQuantity) {
      throw new ApiError(400, `Next operation already exceeds updated transferable quantity (${updatedTransferQuantity})`);
    }
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

    await recordAuditLog(
      {
        actorId: actor?.id,
        action: "PRODUCTION_LOG_UPDATED",
        entityType: "ProductionLog",
        entityId: log.id,
        summary: `${workOrder.orderNo} üretim kaydı güncellendi`,
        metadata: {
          workOrderId: current.workOrderId,
          workOrderOperationId: current.workOrderOperationId,
          producedDelta,
          scrapDelta,
          previousProducedQuantity: current.producedQuantity,
          nextProducedQuantity: log.producedQuantity,
          previousScrapQuantity: current.scrapQuantity,
          nextScrapQuantity: log.scrapQuantity
        }
      },
      tx
    );

    return { log, workOrder, operation };
  });

  emitEvent("production:logged", result.log);
  emitEvent("workOrder:updated", result.workOrder);
  if (result.operation) {
    emitEvent("workOrderOperation:updated", result.operation);
  }
  return result.log;
}
