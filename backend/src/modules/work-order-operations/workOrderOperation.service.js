import { prisma } from "../../config/db.js";
import { emitEvent } from "../../config/socket.js";
import { ApiError } from "../../utils/ApiError.js";
import { recordAuditLog } from "../audit-logs/auditLog.service.js";
import { createNotification, createNotificationsForRoles } from "../notifications/notification.service.js";

const operationInclude = {
  workOrder: {
    include: {
      product: true,
      route: true
    }
  },
  routeOperation: true,
  machine: true,
  assignedOperator: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true
    }
  },
  messages: {
    include: {
      sender: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true
        }
      }
    },
    orderBy: { createdAt: "desc" },
    take: 5
  },
  downtimes: {
    include: {
      shift: true,
      operator: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true
        }
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

async function findActiveShiftId(tx, date = new Date()) {
  const shifts = await tx.shift.findMany({
    where: { isActive: true },
    orderBy: { startTime: "asc" }
  });

  const nowMinutes = date.getHours() * 60 + date.getMinutes();
  return shifts.filter((shift) => isTimeInShift(nowMinutes, shift)).at(-1)?.id;
}

function assertOperatorCanUseOperation(actor, operation) {
  if (actor.role === "OPERATOR" && operation.assignedOperatorId !== actor.id) {
    throw new ApiError(403, "Operator can only manage assigned operations");
  }
}

function isBeforePlannedStart(workOrder, date = new Date()) {
  return Boolean(workOrder.plannedStartDate && date < new Date(workOrder.plannedStartDate));
}

function canReopenShortCompletedOperation(actor, operation) {
  return (
    ["ADMIN", "PRODUCTION_MANAGER"].includes(actor.role) &&
    operation.status === "COMPLETED" &&
    operation.workOrder.plannedQuantity > 0 &&
    operation.producedQuantity < operation.workOrder.plannedQuantity
  );
}

function getOperationTransferQuantity(operation, previousOperation) {
  if (!previousOperation) {
    return operation.workOrder.plannedQuantity;
  }

  return Math.max(previousOperation.producedQuantity - previousOperation.scrapQuantity, 0);
}

async function getOperationOrThrow(id) {
  const operation = await prisma.workOrderOperation.findUnique({
    where: { id },
    include: operationInclude
  });

  if (!operation) {
    throw new ApiError(404, "Work order operation not found");
  }

  return operation;
}

async function getWorkOrderForEmit(workOrderId, tx = prisma) {
  return tx.workOrder.findUnique({
    where: { id: workOrderId },
    include: {
      product: true,
      route: true,
      machine: true,
      assignedOperator: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true
        }
      },
      operations: {
        include: {
          machine: true,
          assignedOperator: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true
            }
          },
          routeOperation: true,
          messages: {
            include: {
              sender: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  role: true
                }
              }
            },
            orderBy: { createdAt: "desc" },
            take: 5
          },
          downtimes: {
            include: {
              shift: true,
              operator: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  role: true
                }
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
    }
  });
}

export function findWorkOrderOperations() {
  return prisma.workOrderOperation.findMany({
    include: operationInclude,
    orderBy: [{ workOrderId: "asc" }, { sequenceNo: "asc" }]
  });
}

export function findAssignedOperations(operatorId) {
  return prisma.workOrderOperation.findMany({
    where: {
      assignedOperatorId: operatorId,
      status: {
        in: ["READY", "IN_PROGRESS", "PAUSED", "WAITING"]
      }
    },
    include: operationInclude,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }, { sequenceNo: "asc" }]
  });
}

export async function startOperation(actor, id) {
  const current = await getOperationOrThrow(id);
  assertOperatorCanUseOperation(actor, current);
  const isReopeningShortCompletedOperation = canReopenShortCompletedOperation(actor, current);

  if (["COMPLETED", "CANCELLED"].includes(current.workOrder.status)) {
    throw new ApiError(400, "Operations of completed or cancelled work orders cannot be started");
  }

  if (actor.role === "OPERATOR" && isBeforePlannedStart(current.workOrder)) {
    throw new ApiError(400, "Plan tarihi gelmeden operatör operasyonu başlatamaz");
  }

  if (!["READY", "PAUSED"].includes(current.status) && !isReopeningShortCompletedOperation) {
    throw new ApiError(400, "Only ready, paused or short-completed operations can be started");
  }

  let downstreamOperations = [];
  if (isReopeningShortCompletedOperation) {
    downstreamOperations = await prisma.workOrderOperation.findMany({
      where: {
        workOrderId: current.workOrderId,
        sequenceNo: { gt: current.sequenceNo }
      },
      orderBy: { sequenceNo: "asc" }
    });

    const hasDownstreamProduction = downstreamOperations.some((operation) => operation.producedQuantity > 0 || operation.scrapQuantity > 0);

    if (hasDownstreamProduction) {
      throw new ApiError(400, "Short-completed operation cannot be reopened after downstream production was logged");
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.operationDowntime.updateMany({
      where: {
        workOrderOperationId: id,
        endedAt: null
      },
      data: { endedAt: new Date() }
    });

    const operation = await tx.workOrderOperation.update({
      where: { id },
      data: {
        status: "IN_PROGRESS",
        startedAt: current.startedAt ?? new Date(),
        completedAt: null
      },
      include: operationInclude
    });

    let resetOperations = [];
    if (isReopeningShortCompletedOperation && downstreamOperations.length) {
      await tx.workOrderOperation.updateMany({
        where: {
          workOrderId: current.workOrderId,
          sequenceNo: { gt: current.sequenceNo },
          status: { not: "WAITING" }
        },
        data: {
          status: "WAITING",
          startedAt: null,
          completedAt: null
        }
      });

      resetOperations = await tx.workOrderOperation.findMany({
        where: {
          workOrderId: current.workOrderId,
          sequenceNo: { gt: current.sequenceNo }
        },
        include: operationInclude,
        orderBy: { sequenceNo: "asc" }
      });
    }

    const workOrder = await tx.workOrder.update({
      where: { id: current.workOrderId },
      data: {
        status: "IN_PROGRESS",
        actualStartDate: current.workOrder.actualStartDate ?? new Date()
      }
    });

    let machine = null;
    if (current.machineId) {
      machine = await tx.machine.update({
        where: { id: current.machineId },
        data: { status: "RUNNING" }
      });
    }

    await recordAuditLog(
      {
        actorId: actor.id,
        action: isReopeningShortCompletedOperation ? "OPERATION_REOPENED" : "OPERATION_STARTED",
        entityType: "WorkOrderOperation",
        entityId: operation.id,
        summary: `${operation.workOrder.orderNo} / ${operation.operationName} operasyonu ${isReopeningShortCompletedOperation ? "yeniden açıldı" : "başlatıldı"}`,
        metadata: {
          workOrderId: current.workOrderId,
          orderNo: operation.workOrder.orderNo,
          sequenceNo: operation.sequenceNo,
          previousStatus: current.status,
          nextStatus: operation.status,
          resetOperationIds: resetOperations.map((resetOperation) => resetOperation.id)
        }
      },
      tx
    );

    if (["ADMIN", "PRODUCTION_MANAGER"].includes(actor.role) && operation.assignedOperatorId && operation.assignedOperatorId !== actor.id) {
      await createNotification(
        {
          recipientId: operation.assignedOperatorId,
          type: isReopeningShortCompletedOperation ? "OPERATION_REOPENED" : "OPERATION_RESTARTED",
          title: isReopeningShortCompletedOperation ? "Operasyon yeniden açıldı" : "Operasyon tekrar başlatıldı",
          message: `${operation.workOrder.orderNo} iş emrinde ${operation.operationName} operasyonu yönetici tarafından başlatıldı.`,
          entityType: "WorkOrderOperation",
          entityId: operation.id,
          metadata: {
            workOrderId: current.workOrderId,
            orderNo: operation.workOrder.orderNo,
            operationName: operation.operationName,
            previousStatus: current.status,
            startedById: actor.id,
            startedByName: actor.name
          }
        },
        tx
      );
    }

    const fullWorkOrder = await getWorkOrderForEmit(current.workOrderId, tx);
    return { operation, resetOperations, workOrder: fullWorkOrder ?? workOrder, machine };
  });

  emitEvent("workOrderOperation:updated", result.operation);
  result.resetOperations.forEach((operation) => emitEvent("workOrderOperation:updated", operation));
  emitEvent("workOrder:updated", result.workOrder);
  if (result.machine) {
    emitEvent("machine:statusChanged", result.machine);
  }

  return result.operation;
}

export async function pauseOperation(actor, id, data) {
  const current = await getOperationOrThrow(id);
  assertOperatorCanUseOperation(actor, current);

  if (current.status !== "IN_PROGRESS") {
    throw new ApiError(400, "Only in-progress operations can be paused");
  }

  const result = await prisma.$transaction(async (tx) => {
    const shiftId = await findActiveShiftId(tx);

    const operation = await tx.workOrderOperation.update({
      where: { id },
      data: { status: "PAUSED" },
      include: operationInclude
    });

    const downtime = await tx.operationDowntime.create({
      data: {
        workOrderId: current.workOrderId,
        workOrderOperationId: current.id,
        machineId: current.machineId,
        operatorId: current.assignedOperatorId,
        shiftId,
        reason: data.reason,
        note: data.note
      },
      include: {
        shift: true,
        operator: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        }
      }
    });

    await tx.workOrder.update({
      where: { id: current.workOrderId },
      data: { status: "PAUSED" }
    });

    let machine = null;
    if (current.machineId) {
      machine = await tx.machine.update({
        where: { id: current.machineId },
        data: { status: "STOPPED" }
      });
    }

    await recordAuditLog(
      {
        actorId: actor.id,
        action: "OPERATION_PAUSED",
        entityType: "WorkOrderOperation",
        entityId: operation.id,
        summary: `${operation.workOrder.orderNo} / ${operation.operationName} operasyonu duraklatıldı`,
        metadata: {
          workOrderId: current.workOrderId,
          orderNo: operation.workOrder.orderNo,
          sequenceNo: operation.sequenceNo,
          previousStatus: current.status,
          nextStatus: operation.status,
          downtimeId: downtime.id,
          downtimeReason: downtime.reason
        }
      },
      tx
    );

    const workOrder = await getWorkOrderForEmit(current.workOrderId, tx);
    return { operation, downtime, workOrder, machine };
  });

  emitEvent("workOrderOperation:updated", result.operation);
  emitEvent("operationDowntime:created", result.downtime);
  emitEvent("workOrder:updated", result.workOrder);
  if (result.machine) {
    emitEvent("machine:statusChanged", result.machine);
  }

  return result.operation;
}

export async function completeOperation(actor, id) {
  const current = await getOperationOrThrow(id);
  assertOperatorCanUseOperation(actor, current);

  if (!["IN_PROGRESS", "PAUSED"].includes(current.status)) {
    throw new ApiError(400, "Only started operations can be completed");
  }

  const productionLogCount = await prisma.productionLog.count({
    where: { workOrderOperationId: id }
  });

  if (productionLogCount === 0) {
    throw new ApiError(400, "At least one production log must be saved before completing an operation");
  }

  const previousOperation = await prisma.workOrderOperation.findFirst({
    where: {
      workOrderId: current.workOrderId,
      sequenceNo: { lt: current.sequenceNo }
    },
    orderBy: { sequenceNo: "desc" }
  });
  const transferQuantity = getOperationTransferQuantity(current, previousOperation);

  if (actor.role === "OPERATOR" && current.producedQuantity + current.scrapQuantity < transferQuantity) {
    throw new ApiError(
      400,
      `Operation cannot be completed before transferable quantity is processed (${current.producedQuantity + current.scrapQuantity}/${transferQuantity})`
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.operationDowntime.updateMany({
      where: {
        workOrderOperationId: id,
        endedAt: null
      },
      data: { endedAt: new Date() }
    });

    const operation = await tx.workOrderOperation.update({
      where: { id },
      data: {
        status: "COMPLETED",
        completedAt: new Date()
      },
      include: operationInclude
    });

    const nextOperation = await tx.workOrderOperation.findFirst({
      where: {
        workOrderId: current.workOrderId,
        sequenceNo: { gt: current.sequenceNo }
      },
      orderBy: { sequenceNo: "asc" }
    });

    let readyOperation = null;
    if (nextOperation?.status === "WAITING") {
      readyOperation = await tx.workOrderOperation.update({
        where: { id: nextOperation.id },
        data: { status: "READY" },
        include: operationInclude
      });

      if (readyOperation.assignedOperatorId) {
        await createNotification(
          {
            recipientId: readyOperation.assignedOperatorId,
            type: "OPERATION_HANDOFF",
            title: "Yeni operasyon size devredildi",
            message: `${operation.workOrder.orderNo} iş emrinde ${readyOperation.operationName} operasyonu hazır.`,
            entityType: "WorkOrderOperation",
            entityId: readyOperation.id,
            metadata: {
              workOrderId: current.workOrderId,
              orderNo: operation.workOrder.orderNo,
              operationName: readyOperation.operationName,
              previousOperationName: operation.operationName
            }
          },
          tx
        );
      }
    }

    const remainingOperationCount = await tx.workOrderOperation.count({
      where: {
        workOrderId: current.workOrderId,
        id: { not: id },
        status: { not: "COMPLETED" }
      }
    });
    const isWorkOrderCompleted = !nextOperation && remainingOperationCount === 0;

    await tx.workOrder.update({
      where: { id: current.workOrderId },
      data: {
        status: isWorkOrderCompleted ? "COMPLETED" : "IN_PROGRESS",
        ...(isWorkOrderCompleted ? { actualEndDate: new Date() } : {})
      }
    });

    let machine = null;
    if (current.machineId) {
      machine = await tx.machine.update({
        where: { id: current.machineId },
        data: { status: "IDLE" }
      });
    }

    await recordAuditLog(
      {
        actorId: actor.id,
        action: "OPERATION_COMPLETED",
        entityType: "WorkOrderOperation",
        entityId: operation.id,
        summary: `${operation.workOrder.orderNo} / ${operation.operationName} operasyonu tamamlandı`,
        metadata: {
          workOrderId: current.workOrderId,
          orderNo: operation.workOrder.orderNo,
          sequenceNo: operation.sequenceNo,
          producedQuantity: operation.producedQuantity,
          scrapQuantity: operation.scrapQuantity,
          plannedQuantity: current.workOrder.plannedQuantity,
          transferQuantity,
          shortCompleted: operation.producedQuantity + operation.scrapQuantity < transferQuantity,
          nextOperationId: readyOperation?.id,
          workOrderCompleted: isWorkOrderCompleted
        }
      },
      tx
    );

    const workOrder = await getWorkOrderForEmit(current.workOrderId, tx);
    return { operation, readyOperation, workOrder, machine };
  });

  emitEvent("workOrderOperation:updated", result.operation);
  if (result.readyOperation) {
    emitEvent("workOrderOperation:updated", result.readyOperation);
  }
  emitEvent("workOrder:updated", result.workOrder);
  if (result.machine) {
    emitEvent("machine:statusChanged", result.machine);
  }

  return result.operation;
}

export async function createOperationMessage(actor, id, data) {
  const operation = await getOperationOrThrow(id);

  if (actor.role === "OPERATOR" && operation.assignedOperatorId !== actor.id) {
    throw new ApiError(403, "Operator can only message assigned operations");
  }

  const message = await prisma.operationMessage.create({
    data: {
      workOrderOperationId: id,
      senderId: actor.id,
      message: data.message,
      severity: data.severity ?? "INFO"
    },
    include: {
      sender: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true
        }
      },
      workOrderOperation: {
        include: {
          workOrder: {
            include: {
              product: true,
              route: true
            }
          },
          machine: true
        }
      }
    }
  });

  if (operation.assignedOperatorId && operation.assignedOperatorId !== actor.id) {
    await createNotification({
      recipientId: operation.assignedOperatorId,
      type: "OPERATION_MESSAGE",
      title: "Operasyon mesajı geldi",
      message: `${operation.workOrder.orderNo} / ${operation.operationName}: ${message.message}`,
      entityType: "WorkOrderOperation",
      entityId: operation.id,
      metadata: {
        workOrderId: operation.workOrderId,
        orderNo: operation.workOrder.orderNo,
        operationName: operation.operationName,
        severity: message.severity,
        senderId: actor.id,
        senderName: actor.name
      }
    });
  }

  if (actor.role === "OPERATOR") {
    await createNotificationsForRoles(["ADMIN", "PRODUCTION_MANAGER", "QUALITY_STAFF"], {
      type: "OPERATOR_FIELD_MESSAGE",
      title: "Operatörden saha mesajı",
      message: `${operation.workOrder.orderNo} / ${operation.operationName}: ${message.message}`,
      entityType: "WorkOrderOperation",
      entityId: operation.id,
      metadata: {
        workOrderId: operation.workOrderId,
        orderNo: operation.workOrder.orderNo,
        operationName: operation.operationName,
        severity: message.severity,
        senderId: actor.id,
        senderName: actor.name
      }
    });
  }

  await recordAuditLog({
    actorId: actor.id,
    action: "OPERATION_MESSAGE_CREATED",
    entityType: "WorkOrderOperation",
    entityId: operation.id,
    summary: `${message.workOrderOperation.workOrder.orderNo} / ${operation.operationName} operasyonuna mesaj bırakıldı`,
    metadata: {
      workOrderId: operation.workOrderId,
      messageId: message.id,
      severity: message.severity,
      message: message.message
    }
  });

  const updatedOperation = await getOperationOrThrow(id);
  const workOrder = await getWorkOrderForEmit(operation.workOrderId);

  emitEvent("operationMessage:created", message);
  emitEvent("workOrderOperation:updated", updatedOperation);
  emitEvent("workOrder:updated", workOrder);

  return message;
}
