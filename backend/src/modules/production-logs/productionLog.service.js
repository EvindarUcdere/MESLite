import { prisma } from "../../config/db.js";
import { emitEvent } from "../../config/socket.js";
import { DOMAIN_EVENTS } from "../../events/domainEvents.js";
import { emitDomainEvent } from "../../events/domainEventBus.js";
import { ApiError } from "../../utils/ApiError.js";
import { recordAuditLog } from "../audit-logs/auditLog.service.js";
import { createNotification, createNotificationsForRoles } from "../notifications/notification.service.js";
import { createProductionAlert } from "../production-alerts/productionAlert.service.js";
import { reserveMaterialStock } from "../work-orders/workOrder.service.js";

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

function buildScrapActionOrderNo(workOrder, disposition) {
  const suffix = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const token = Math.random().toString(36).slice(2, 6).toUpperCase();
  const type = disposition === "REWORK" ? "RWK" : "TELAFI";
  return `${workOrder.orderNo}-${type}-${suffix}-${token}`;
}

function calculatePlannedEndDate(startDate, routeOperations = []) {
  const plannedMinutes = routeOperations.reduce(
    (sum, routeOperation) => sum + Math.max(Number(routeOperation.estimatedMinutes ?? 0), 0),
    0
  );

  return new Date(startDate.getTime() + Math.max(plannedMinutes, 1) * 60_000);
}

function getScrapLotState(disposition) {
  switch (disposition) {
    case "REWORK":
      return { status: "REWORK_PLANNED", location: "KARANTINA" };
    case "REPRODUCE":
      return { status: "REPRODUCTION_PLANNED", location: "KARANTINA" };
    case "SCRAP":
      return { status: "SCRAPPED", location: "HURDA" };
    case "CONDITIONAL_ACCEPT":
      return { status: "CONDITIONALLY_ACCEPTED", location: "SERBEST" };
    default:
      return { status: "QUARANTINED", location: "KARANTINA" };
  }
}

async function updateScrapLotDecision(tx, { productionLogId, disposition, actionWorkOrderId, actorId, note }) {
  const state = getScrapLotState(disposition);
  const isResolved = disposition && disposition !== "PENDING_REVIEW";

  await tx.scrapLot.update({
    where: { productionLogId },
    data: {
      disposition: disposition ?? "PENDING_REVIEW",
      status: state.status,
      location: state.location,
      actionWorkOrderId: actionWorkOrderId ?? null,
      resolvedById: isResolved ? actorId : null,
      resolvedAt: isResolved ? new Date() : null,
      note: note ?? null
    }
  });
}

async function createScrapActionWorkOrder(tx, { actor, workOrder, operation, log, data }) {
  if (!data.scrapQuantity || !data.scrapDisposition) {
    return {
      status: "NOT_REQUIRED",
      note: "Fire yok, aksiyon gerekmiyor."
    };
  }

  if (data.scrapDisposition === "CONDITIONAL_ACCEPT") {
    return {
      status: "NOT_REQUIRED",
      note: "Fire şartlı kabul edildi; ek üretim aksiyonu gerekmedi."
    };
  }

  if (data.scrapDisposition === "PENDING_REVIEW") {
    return {
      status: "PENDING",
      note: "Fire kararı inceleme bekliyor."
    };
  }

  const actionQuantity = data.scrapResolutionQuantity > 0 ? data.scrapResolutionQuantity : data.scrapQuantity;
  const orderNo = buildScrapActionOrderNo(workOrder, data.scrapDisposition);
  const isRework = data.scrapDisposition === "REWORK";
  const isScrapReplacement = data.scrapDisposition === "SCRAP";
  const routeOperations = workOrder.route?.operations ?? [];
  const sourceOperationByRouteOperationId = new Map((workOrder.operations ?? []).map((sourceOperation) => [sourceOperation.routeOperationId, sourceOperation]));
  const sourceOperationBySequenceNo = new Map((workOrder.operations ?? []).map((sourceOperation) => [sourceOperation.sequenceNo, sourceOperation]));
  const replacementFirstOperatorId = operation?.assignedOperatorId ?? (actor.role === "OPERATOR" ? actor.id : null);

  const plannedStartDate = new Date();
  const plannedEndDate = calculatePlannedEndDate(
    plannedStartDate,
    isRework ? routeOperations.filter((routeOperation) => routeOperation.id === operation?.routeOperationId) : routeOperations
  );
  const actionWorkOrder = await tx.workOrder.create({
    data: {
      orderNo,
      productId: workOrder.productId,
      routeId: workOrder.routeId,
      machineId: isRework ? operation?.machineId ?? data.machineId : workOrder.machineId,
      assignedOperatorId: isRework ? operation?.assignedOperatorId ?? null : null,
      plannedQuantity: actionQuantity,
      plannedStartDate,
      plannedEndDate,
      createdById: actor.id
    }
  });

  if (!isRework) {
    await reserveMaterialStock(tx, workOrder.productId, actionQuantity);
  }

  if (isRework && operation?.routeOperationId) {
    await tx.workOrderOperation.create({
      data: {
        workOrderId: actionWorkOrder.id,
        routeOperationId: operation.routeOperationId,
        machineId: operation.machineId,
        assignedOperatorId: operation.assignedOperatorId,
        sequenceNo: 1,
        operationName: `Yeniden İşlem - ${operation.operationName}`,
        status: "READY"
      }
    });
  } else if (!isRework && routeOperations.length) {
    await tx.workOrderOperation.createMany({
      data: routeOperations.map((routeOperation, index) => {
        const sourceOperation =
          sourceOperationByRouteOperationId.get(routeOperation.id) ?? sourceOperationBySequenceNo.get(routeOperation.sequenceNo);

        return {
          workOrderId: actionWorkOrder.id,
          routeOperationId: routeOperation.id,
          machineId: sourceOperation?.machineId ?? routeOperation.defaultMachineId,
          assignedOperatorId: sourceOperation?.assignedOperatorId ?? (index === 0 ? replacementFirstOperatorId : null),
          sequenceNo: routeOperation.sequenceNo,
          operationName: routeOperation.operationName,
          status: index === 0 ? "READY" : "WAITING"
        };
      })
    });
  }

  await createNotificationsForRoles(
    ["PLANNER", "PRODUCTION_MANAGER", "QUALITY_STAFF"],
    {
      type: isRework ? "SCRAP_REWORK_ORDER_CREATED" : "SCRAP_REPRODUCTION_ORDER_CREATED",
      title: isRework ? "Yeniden işlem emri oluşturuldu" : "Telafi üretim emri oluşturuldu",
      message: `${workOrder.orderNo} fire kararı için ${orderNo} iş emri oluşturuldu (${actionQuantity} adet).`,
      entityType: "WorkOrder",
      entityId: actionWorkOrder.id,
      metadata: {
        sourceWorkOrderId: workOrder.id,
        sourceOrderNo: workOrder.orderNo,
        sourceProductionLogId: log.id,
        actionWorkOrderId: actionWorkOrder.id,
        actionOrderNo: orderNo,
        scrapDisposition: data.scrapDisposition,
        actionQuantity
      }
    },
    tx
  );

  if (!isRework && replacementFirstOperatorId) {
    await createNotification(
      {
        recipientId: replacementFirstOperatorId,
        type: "SCRAP_REPRODUCTION_ASSIGNED",
        title: "Telafi üretim atandı",
        message: `${workOrder.orderNo} fire kararı için ${orderNo} telafi iş emrinin ilk operasyonu size atandı (${actionQuantity} adet).`,
        entityType: "WorkOrder",
        entityId: actionWorkOrder.id,
        metadata: {
          sourceWorkOrderId: workOrder.id,
          sourceOrderNo: workOrder.orderNo,
          sourceProductionLogId: log.id,
          actionWorkOrderId: actionWorkOrder.id,
          actionOrderNo: orderNo,
          scrapDisposition: data.scrapDisposition,
          actionQuantity
        }
      },
      tx
    );
  }

  await recordAuditLog(
    {
      actorId: actor.id,
      action: isRework ? "SCRAP_REWORK_WORK_ORDER_CREATED" : "SCRAP_REPRODUCTION_WORK_ORDER_CREATED",
      entityType: "WorkOrder",
      entityId: actionWorkOrder.id,
      summary: `${workOrder.orderNo} fire kararı için ${orderNo} telafi iş emri oluşturuldu`,
      metadata: {
        sourceWorkOrderId: workOrder.id,
        sourceProductionLogId: log.id,
        scrapDisposition: data.scrapDisposition,
        scrapQuantity: data.scrapQuantity,
        actionQuantity
      }
    },
    tx
  );

  return {
    status: "CREATED",
    workOrderId: actionWorkOrder.id,
    workOrderNo: orderNo,
    note: isRework
      ? `${actionQuantity} adet için yeniden işlem emri oluşturuldu.`
      : `${actionQuantity} adet ${isScrapReplacement ? "hurda firesi" : "eksik üretim"} için telafi üretim emri oluşturuldu.`
  };
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
  const hasScrap = data.scrapQuantity > 0;
  const shouldDeferScrapDecision = hasScrap && actor.role === "OPERATOR";
  const effectiveScrapDisposition = shouldDeferScrapDecision ? "PENDING_REVIEW" : data.scrapDisposition;
  const effectiveScrapResolutionQuantity = shouldDeferScrapDecision ? 0 : data.scrapResolutionQuantity ?? 0;

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

    if (operation && data.expectedOperationVersion !== undefined && operation.version !== data.expectedOperationVersion) {
      throw new ApiError(409, "Bu operasyon başka bir kullanıcı tarafından güncellendi. Lütfen ekranı yenileyip tekrar deneyin.");
    }

    const workOrder = await tx.workOrder.findUnique({
      where: { id: data.workOrderId },
      include: {
        product: true,
        route: {
          include: {
            operations: {
              orderBy: { sequenceNo: "asc" }
            }
          }
        },
        operations: {
          orderBy: { sequenceNo: "asc" }
        }
      }
    });

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

    let log = await tx.productionLog.create({
      data: {
        workOrderId: data.workOrderId,
        workOrderOperationId: data.workOrderOperationId,
        operatorId,
        machineId: data.machineId,
        shiftId,
        producedQuantity: data.producedQuantity,
        scrapQuantity: data.scrapQuantity,
        scrapReason: data.scrapQuantity > 0 ? data.scrapReason : null,
        scrapDisposition: data.scrapQuantity > 0 ? effectiveScrapDisposition : null,
        scrapResolutionQuantity: data.scrapQuantity > 0 ? effectiveScrapResolutionQuantity : 0,
        scrapDispositionNote: data.scrapQuantity > 0 ? data.scrapDispositionNote : null,
        scrapActionStatus: data.scrapQuantity > 0 ? "PENDING" : "NOT_REQUIRED",
        startedAt: data.startedAt ? new Date(data.startedAt) : undefined,
        endedAt: data.endedAt ? new Date(data.endedAt) : undefined,
        note: data.note
      },
      include: includeRelations
    });

    let alert = null;

    let scrapAction = null;

    if (data.scrapQuantity > 0) {
      await tx.scrapLot.create({
        data: {
          productionLogId: log.id,
          workOrderId: workOrder.id,
          workOrderOperationId: operation?.id ?? null,
          productId: workOrder.productId,
          quantity: data.scrapQuantity,
          reason: data.scrapReason,
          disposition: effectiveScrapDisposition,
          status: "QUARANTINED",
          location: "KARANTINA",
          note: data.scrapDispositionNote
        }
      });

      await createNotificationsForRoles(
        ["PLANNER", "PRODUCTION_MANAGER", "QUALITY_STAFF"],
        {
          type: "SCRAP_RECORDED",
          title: shouldDeferScrapDecision ? "Fire kararı bekliyor" : "Fire kararı girildi",
          message: shouldDeferScrapDecision
            ? `${workOrder.orderNo}: ${data.scrapQuantity} fire kaydı için kalite/yönetici kararı bekleniyor.`
            : `${workOrder.orderNo}: ${data.scrapQuantity} fire - karar ${effectiveScrapDisposition}`,
          entityType: "ProductionLog",
          entityId: log.id,
          metadata: {
            workOrderId: workOrder.id,
            orderNo: workOrder.orderNo,
            productionLogId: log.id,
            workOrderOperationId: data.workOrderOperationId,
            machineId: data.machineId,
            operatorId,
            scrapQuantity: data.scrapQuantity,
            scrapReason: data.scrapReason,
            scrapDisposition: effectiveScrapDisposition,
            scrapResolutionQuantity: effectiveScrapResolutionQuantity
          }
        },
        tx
      );

      scrapAction = shouldDeferScrapDecision
        ? {
            status: "PENDING",
            note: "Fire kararı kalite/yönetici incelemesi bekliyor."
          }
        : await createScrapActionWorkOrder(tx, {
            actor,
            workOrder,
            operation,
            log,
            data: {
              ...data,
              scrapDisposition: effectiveScrapDisposition,
              scrapResolutionQuantity: effectiveScrapResolutionQuantity
            }
          });

      log = await tx.productionLog.update({
        where: { id: log.id },
        data: {
          scrapActionStatus: scrapAction.status,
          scrapActionWorkOrderId: scrapAction.workOrderId,
          scrapActionWorkOrderNo: scrapAction.workOrderNo,
          scrapActionNote: scrapAction.note
        },
        include: includeRelations
      });

      await updateScrapLotDecision(tx, {
        productionLogId: log.id,
        disposition: effectiveScrapDisposition,
        actionWorkOrderId: scrapAction.workOrderId,
        actorId: actor.id,
        note: scrapAction.note ?? data.scrapDispositionNote
      });
    }

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
        ["PRODUCTION_MANAGER", "QUALITY_STAFF"],
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
      const operationUpdate = await tx.workOrderOperation.updateMany({
        where: {
          id: operation.id,
          version: operation.version
        },
        data: {
          status: operation.status === "READY" ? "IN_PROGRESS" : operation.status,
          startedAt: operation.startedAt ?? new Date(),
          producedQuantity: { increment: data.producedQuantity },
          scrapQuantity: { increment: data.scrapQuantity },
          version: { increment: 1 }
        }
      });

      if (operationUpdate.count !== 1) {
        throw new ApiError(409, "Bu operasyon başka bir kullanıcı tarafından güncellendi. Lütfen ekranı yenileyip tekrar deneyin.");
      }

      updatedOperation = await tx.workOrderOperation.findUnique({
        where: { id: operation.id },
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
          scrapDisposition: data.scrapQuantity > 0 ? effectiveScrapDisposition : null,
          scrapResolutionQuantity: data.scrapQuantity > 0 ? effectiveScrapResolutionQuantity : 0,
          scrapDispositionNote: data.scrapQuantity > 0 ? data.scrapDispositionNote : null,
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

    return { log, workOrder: fullWorkOrder ?? updatedWorkOrder, operation: updatedOperation, alert, scrapAction };
  });

  if (result.scrapAction?.status === "CREATED") {
    emitDomainEvent(DOMAIN_EVENTS.SCRAP_ACTION_WORK_ORDER_CREATED, {
      sourceWorkOrderId: result.workOrder?.id,
      sourceWorkOrderNo: result.workOrder?.orderNo,
      productionLogId: result.log.id,
      actionWorkOrderId: result.scrapAction.workOrderId,
      actionWorkOrderNo: result.scrapAction.workOrderNo,
      note: result.scrapAction.note
    });
  }

  emitDomainEvent(DOMAIN_EVENTS.PRODUCTION_LOG_CREATED, {
    productionLog: result.log,
    workOrderId: result.workOrder?.id,
    workOrderNo: result.workOrder?.orderNo,
    workOrderOperationId: result.operation?.id,
    producedQuantity: result.log.producedQuantity,
    scrapQuantity: result.log.scrapQuantity
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

export async function createScrapActionForProductionLog(actor, id, data) {
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.productionLog.findUnique({
      where: { id },
      include: {
        workOrderOperation: true,
        workOrder: {
          include: {
            product: true,
            route: {
              include: {
                operations: {
                  orderBy: { sequenceNo: "asc" }
                }
              }
            },
            operations: {
              orderBy: { sequenceNo: "asc" }
            }
          }
        }
      }
    });

    if (!current) {
      throw new ApiError(404, "Üretim kaydı bulunamadı");
    }

    if (current.scrapQuantity <= 0) {
      throw new ApiError(400, "Telafi iş emri yalnızca fire kaydı için oluşturulabilir");
    }

    if (current.scrapActionStatus === "CREATED" && current.scrapActionWorkOrderId) {
      throw new ApiError(400, "Bu fire kaydı için telafi/rework iş emri zaten oluşturulmuş");
    }

    const scrapDisposition = data.scrapDisposition ?? current.scrapDisposition ?? "REPRODUCE";
    const scrapResolutionQuantity = (data.scrapResolutionQuantity ?? current.scrapResolutionQuantity) || current.scrapQuantity;

    if (scrapResolutionQuantity > current.scrapQuantity) {
      throw new ApiError(400, "Telafi miktarı fire adedini aşamaz");
    }

    const decisionData = {
      scrapQuantity: current.scrapQuantity,
      scrapReason: current.scrapReason,
      scrapDisposition,
      scrapResolutionQuantity,
      scrapDispositionNote: data.scrapDispositionNote ?? current.scrapDispositionNote
    };

    const scrapAction = await createScrapActionWorkOrder(tx, {
      actor,
      workOrder: current.workOrder,
      operation: current.workOrderOperation,
      log: current,
      data: decisionData
    });

    const updatedLog = await tx.productionLog.update({
      where: { id },
      data: {
        scrapDisposition,
        scrapResolutionQuantity,
        scrapDispositionNote: decisionData.scrapDispositionNote,
        scrapActionStatus: scrapAction.status,
        scrapActionWorkOrderId: scrapAction.workOrderId,
        scrapActionWorkOrderNo: scrapAction.workOrderNo,
        scrapActionNote: scrapAction.note
      },
      include: includeRelations
    });

    await updateScrapLotDecision(tx, {
      productionLogId: current.id,
      disposition: scrapDisposition,
      actionWorkOrderId: scrapAction.workOrderId,
      actorId: actor.id,
      note: scrapAction.note ?? decisionData.scrapDispositionNote
    });

    await recordAuditLog(
      {
        actorId: actor.id,
        action: "SCRAP_ACTION_CREATED_FROM_LOG",
        entityType: "ProductionLog",
        entityId: id,
        summary: `${current.workOrder.orderNo} fire kaydı için telafi/rework aksiyonu oluşturuldu`,
        metadata: {
          workOrderId: current.workOrderId,
          workOrderOperationId: current.workOrderOperationId,
          scrapQuantity: current.scrapQuantity,
          scrapDisposition,
          scrapResolutionQuantity,
          scrapActionStatus: scrapAction.status,
          scrapActionWorkOrderId: scrapAction.workOrderId
        }
      },
      tx
    );

    const fullWorkOrder = await tx.workOrder.findUnique({
      where: { id: current.workOrderId },
      include: workOrderEmitInclude
    });

    return { log: updatedLog, workOrder: fullWorkOrder };
  });

  emitEvent("production:logged", result.log);
  if (result.workOrder) {
    emitEvent("workOrder:updated", result.workOrder);
  }

  return result.log;
}

export async function createGroupedScrapActionForWorkOrder(actor, workOrderId, data) {
  const result = await prisma.$transaction(async (tx) => {
    const workOrder = await tx.workOrder.findUnique({
      where: { id: workOrderId },
      include: {
        product: true,
        route: {
          include: {
            operations: {
              orderBy: { sequenceNo: "asc" }
            }
          }
        },
        operations: {
          orderBy: { sequenceNo: "asc" }
        },
        productionLogs: {
          where: {
            scrapQuantity: { gt: 0 },
            scrapActionStatus: { notIn: ["CREATED", "NOT_REQUIRED"] }
          },
          include: {
            workOrderOperation: true
          },
          orderBy: { createdAt: "asc" }
        }
      }
    });

    if (!workOrder) {
      throw new ApiError(404, "İş emri bulunamadı");
    }

    const actionableLogs = workOrder.productionLogs.filter((log) => !log.scrapActionWorkOrderId);

    if (!actionableLogs.length) {
      throw new ApiError(400, "Toplu telafi oluşturulacak açık fire kaydı yok");
    }

    if (!workOrder.routeId || !workOrder.route?.operations.length) {
      throw new ApiError(400, "Toplu telafi için kaynak iş emrinde rota akışı olmalıdır");
    }

    const actionQuantity = actionableLogs.reduce(
      (sum, log) => sum + (log.scrapResolutionQuantity > 0 ? log.scrapResolutionQuantity : log.scrapQuantity),
      0
    );

    if (actionQuantity <= 0) {
      throw new ApiError(400, "Toplu telafi miktarı sıfırdan büyük olmalıdır");
    }

    const scrapDisposition = data.scrapDisposition ?? "REPRODUCE";
    const orderNo = buildScrapActionOrderNo(workOrder, scrapDisposition);
    const sourceOperationByRouteOperationId = new Map(workOrder.operations.map((operation) => [operation.routeOperationId, operation]));
    const sourceOperationBySequenceNo = new Map(workOrder.operations.map((operation) => [operation.sequenceNo, operation]));

    const plannedStartDate = new Date();
    const plannedEndDate = calculatePlannedEndDate(plannedStartDate, workOrder.route.operations);
    const actionWorkOrder = await tx.workOrder.create({
      data: {
        orderNo,
        productId: workOrder.productId,
        routeId: workOrder.routeId,
        machineId: workOrder.machineId,
        assignedOperatorId: null,
        plannedQuantity: actionQuantity,
        plannedStartDate,
        plannedEndDate,
        createdById: actor.id
      }
    });

    await tx.workOrderOperation.createMany({
      data: workOrder.route.operations.map((routeOperation, index) => {
        const sourceOperation =
          sourceOperationByRouteOperationId.get(routeOperation.id) ?? sourceOperationBySequenceNo.get(routeOperation.sequenceNo);

        return {
          workOrderId: actionWorkOrder.id,
          routeOperationId: routeOperation.id,
          machineId: sourceOperation?.machineId ?? routeOperation.defaultMachineId,
          assignedOperatorId: sourceOperation?.assignedOperatorId ?? null,
          sequenceNo: routeOperation.sequenceNo,
          operationName: routeOperation.operationName,
          status: index === 0 ? "READY" : "WAITING"
        };
      })
    });

    for (const log of actionableLogs) {
      const resolutionQuantity = log.scrapResolutionQuantity > 0 ? log.scrapResolutionQuantity : log.scrapQuantity;

      await tx.productionLog.update({
        where: { id: log.id },
        data: {
          scrapDisposition,
          scrapResolutionQuantity: resolutionQuantity,
          scrapDispositionNote: data.scrapDispositionNote ?? log.scrapDispositionNote,
          scrapActionStatus: "CREATED",
          scrapActionWorkOrderId: actionWorkOrder.id,
          scrapActionWorkOrderNo: orderNo,
          scrapActionNote: `${actionableLogs.length} fire kaydı tek telafi iş emrinde birleştirildi. Toplam telafi: ${actionQuantity} adet.`
        }
      });
    }

    await createNotificationsForRoles(
      ["PLANNER", "PRODUCTION_MANAGER", "QUALITY_STAFF"],
      {
        type: "GROUPED_SCRAP_REPRODUCTION_ORDER_CREATED",
        title: "Toplu telafi üretim emri oluşturuldu",
        message: `${workOrder.orderNo} iş emrindeki ${actionableLogs.length} fire kaydı için ${orderNo} telafi iş emri oluşturuldu (${actionQuantity} adet).`,
        entityType: "WorkOrder",
        entityId: actionWorkOrder.id,
        metadata: {
          sourceWorkOrderId: workOrder.id,
          sourceOrderNo: workOrder.orderNo,
          actionWorkOrderId: actionWorkOrder.id,
          actionOrderNo: orderNo,
          actionQuantity,
          productionLogIds: actionableLogs.map((log) => log.id)
        }
      },
      tx
    );

    const firstAssignedOperatorId = workOrder.operations.find((operation) => operation.assignedOperatorId)?.assignedOperatorId;
    if (firstAssignedOperatorId) {
      await createNotification(
        {
          recipientId: firstAssignedOperatorId,
          type: "GROUPED_SCRAP_REPRODUCTION_ASSIGNED",
          title: "Toplu telafi üretim atandı",
          message: `${workOrder.orderNo} fire kayıtları için ${orderNo} telafi iş emrinin ilk operasyonu size atandı (${actionQuantity} adet).`,
          entityType: "WorkOrder",
          entityId: actionWorkOrder.id,
          metadata: {
            sourceWorkOrderId: workOrder.id,
            sourceOrderNo: workOrder.orderNo,
            actionWorkOrderId: actionWorkOrder.id,
            actionOrderNo: orderNo,
            actionQuantity
          }
        },
        tx
      );
    }

    await recordAuditLog(
      {
        actorId: actor.id,
        action: "GROUPED_SCRAP_REPRODUCTION_WORK_ORDER_CREATED",
        entityType: "WorkOrder",
        entityId: actionWorkOrder.id,
        summary: `${workOrder.orderNo} fire kayıtları için toplu telafi iş emri oluşturuldu`,
        metadata: {
          sourceWorkOrderId: workOrder.id,
          actionWorkOrderId: actionWorkOrder.id,
          actionOrderNo: orderNo,
          actionQuantity,
          productionLogIds: actionableLogs.map((log) => log.id)
        }
      },
      tx
    );

    const sourceWorkOrder = await tx.workOrder.findUnique({
      where: { id: workOrder.id },
      include: workOrderEmitInclude
    });
    const fullActionWorkOrder = await tx.workOrder.findUnique({
      where: { id: actionWorkOrder.id },
      include: workOrderEmitInclude
    });

    return { sourceWorkOrder, actionWorkOrder: fullActionWorkOrder };
  });

  if (result.sourceWorkOrder) {
    emitEvent("workOrder:updated", result.sourceWorkOrder);
  }
  if (result.actionWorkOrder) {
    emitDomainEvent(DOMAIN_EVENTS.SCRAP_ACTION_WORK_ORDER_CREATED, {
      sourceWorkOrderId: result.sourceWorkOrder?.id,
      sourceWorkOrderNo: result.sourceWorkOrder?.orderNo,
      actionWorkOrderId: result.actionWorkOrder.id,
      actionWorkOrderNo: result.actionWorkOrder.orderNo,
      grouped: true
    });
    emitEvent("workOrder:updated", result.actionWorkOrder);
  }

  return result.actionWorkOrder;
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
    const updatedTransferQuantity = Math.max(updatedCurrentProduced, 0);

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
        scrapDisposition: data.scrapQuantity === 0 ? null : data.scrapDisposition,
        scrapResolutionQuantity: data.scrapQuantity === 0 ? 0 : data.scrapResolutionQuantity,
        scrapDispositionNote: data.scrapQuantity === 0 ? null : data.scrapDispositionNote,
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
          nextScrapQuantity: log.scrapQuantity,
          scrapDisposition: log.scrapDisposition,
          scrapResolutionQuantity: log.scrapResolutionQuantity
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
