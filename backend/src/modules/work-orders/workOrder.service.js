import { prisma } from "../../config/db.js";
import { emitEvent } from "../../config/socket.js";
import { ApiError } from "../../utils/ApiError.js";
import { recordAuditLog } from "../audit-logs/auditLog.service.js";

const workOrderInclude = {
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
    select: {
      id: true,
      name: true,
      email: true,
      role: true
    }
  },
  createdBy: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true
    }
  },
  productionLogs: {
    include: {
      operator: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true
        }
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
      _count: {
        select: {
          productionLogs: true
        }
      }
    },
    orderBy: { sequenceNo: "asc" }
  }
};

export function findWorkOrders() {
  return prisma.workOrder.findMany({
    include: workOrderInclude,
    orderBy: { createdAt: "desc" }
  });
}

export function findWorkOrderById(id) {
  return prisma.workOrder.findUnique({
    where: { id },
    include: {
      ...workOrderInclude,
      qualityChecks: true
    }
  });
}

export async function createWorkOrder(userId, data) {
  const result = await prisma.$transaction(async (tx) => {
    let route = null;

    if (data.routeId) {
      route = await tx.productRoute.findUnique({
        where: { id: data.routeId },
        include: {
          operations: {
            orderBy: { sequenceNo: "asc" }
          }
        }
      });

      if (!route || !route.isActive) {
        throw new ApiError(400, "Active product route is required");
      }

      if (route.productId !== data.productId) {
        throw new ApiError(400, "Selected route must belong to the selected product");
      }

      if (!route.operations.length) {
        throw new ApiError(400, "Selected route must have at least one operation");
      }
    }

    const workOrder = await tx.workOrder.create({
      data: {
        orderNo: data.orderNo,
        productId: data.productId,
        routeId: data.routeId,
        machineId: data.machineId,
        assignedOperatorId: data.assignedOperatorId,
        plannedQuantity: data.plannedQuantity,
        plannedStartDate: data.plannedStartDate ? new Date(data.plannedStartDate) : undefined,
        plannedEndDate: data.plannedEndDate ? new Date(data.plannedEndDate) : undefined,
        createdById: userId
      }
    });

    if (route) {
      await tx.workOrderOperation.createMany({
        data: route.operations.map((operation, index) => ({
          workOrderId: workOrder.id,
          routeOperationId: operation.id,
          machineId: operation.defaultMachineId ?? data.machineId,
          assignedOperatorId: data.assignedOperatorId,
          sequenceNo: operation.sequenceNo,
          operationName: operation.operationName,
          status: index === 0 ? "READY" : "WAITING"
        }))
      });
    }

    await recordAuditLog(
      {
        actorId: userId,
        action: "WORK_ORDER_CREATED",
        entityType: "WorkOrder",
        entityId: workOrder.id,
        summary: `${workOrder.orderNo} iş emri oluşturuldu`,
        metadata: {
          orderNo: workOrder.orderNo,
          plannedQuantity: workOrder.plannedQuantity,
          productId: workOrder.productId,
          routeId: workOrder.routeId,
          operationCount: route?.operations.length ?? 0
        }
      },
      tx
    );

    return tx.workOrder.findUnique({
      where: { id: workOrder.id },
      include: workOrderInclude
    });
  });

  emitEvent("workOrder:updated", result);
  return result;
}

export async function updateWorkOrderStatus(actor, id, status) {
  const statusDates = {
    ...(status === "IN_PROGRESS" ? { actualStartDate: new Date() } : {}),
    ...(status === "COMPLETED" ? { actualEndDate: new Date() } : {})
  };

  const workOrder = await prisma.$transaction(async (tx) => {
    const updated = await tx.workOrder.update({
      where: { id },
      data: { status, ...statusDates },
      include: workOrderInclude
    });

    await recordAuditLog(
      {
        actorId: actor?.id,
        action: "WORK_ORDER_STATUS_CHANGED",
        entityType: "WorkOrder",
        entityId: updated.id,
        summary: `${updated.orderNo} iş emri durumu ${status} yapıldı`,
        metadata: { status }
      },
      tx
    );

    return updated;
  });

  emitEvent("workOrder:updated", workOrder);
  return workOrder;
}

export async function assignOperator(actor, id, operatorId) {
  const operator = await prisma.user.findUnique({ where: { id: operatorId } });

  if (!operator || operator.role !== "OPERATOR" || !operator.isActive) {
    throw new ApiError(400, "Active operator user is required");
  }

  const workOrder = await prisma.$transaction(async (tx) => {
    const updated = await tx.workOrder.update({
      where: { id },
      data: { assignedOperatorId: operatorId },
      include: workOrderInclude
    });

    await recordAuditLog(
      {
        actorId: actor?.id,
        action: "WORK_ORDER_OPERATOR_ASSIGNED",
        entityType: "WorkOrder",
        entityId: updated.id,
        summary: `${updated.orderNo} iş emrine ${operator.name} operatörü atandı`,
        metadata: { operatorId, operatorName: operator.name }
      },
      tx
    );

    return updated;
  });

  emitEvent("workOrder:updated", workOrder);
  return workOrder;
}

export async function assignMachine(actor, id, machineId) {
  const machine = await prisma.machine.findUnique({ where: { id: machineId } });

  if (!machine || !machine.isActive) {
    throw new ApiError(400, "Active machine is required");
  }

  const workOrder = await prisma.$transaction(async (tx) => {
    const updated = await tx.workOrder.update({
      where: { id },
      data: { machineId },
      include: workOrderInclude
    });

    await recordAuditLog(
      {
        actorId: actor?.id,
        action: "WORK_ORDER_MACHINE_ASSIGNED",
        entityType: "WorkOrder",
        entityId: updated.id,
        summary: `${updated.orderNo} iş emrine ${machine.code} makinesi atandı`,
        metadata: { machineId, machineCode: machine.code, machineName: machine.name }
      },
      tx
    );

    return updated;
  });

  emitEvent("workOrder:updated", workOrder);
  return workOrder;
}

export async function startWorkOrder(id, actor) {
  const current = await prisma.workOrder.findUnique({
    where: { id },
    include: {
      operations: {
        orderBy: { sequenceNo: "asc" }
      }
    }
  });

  if (!current) {
    throw new ApiError(404, "Work order not found");
  }

  if (["COMPLETED", "CANCELLED"].includes(current.status)) {
    throw new ApiError(400, "Completed or cancelled work orders cannot be started");
  }

  const hasOperationFlow = current.operations.length > 0;
  const targetOperation = hasOperationFlow
    ? current.operations.find((operation) => operation.status === "PAUSED") ?? current.operations.find((operation) => operation.status === "READY")
    : null;

  if (hasOperationFlow && !targetOperation) {
    throw new ApiError(400, "No paused or ready operation can be started for this work order");
  }

  if (hasOperationFlow && (!targetOperation.machineId || !targetOperation.assignedOperatorId)) {
    throw new ApiError(400, "Operation machine and operator must be assigned before starting production");
  }

  if (!hasOperationFlow && (!current.machineId || !current.assignedOperatorId)) {
    throw new ApiError(400, "Machine and operator must be assigned before starting production");
  }

  const result = await prisma.$transaction(async (tx) => {
    let operation = null;

    if (targetOperation) {
      operation = await tx.workOrderOperation.update({
        where: { id: targetOperation.id },
        data: {
          status: "IN_PROGRESS",
          startedAt: targetOperation.startedAt ?? new Date()
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

    const updated = await tx.workOrder.update({
      where: { id },
      data: {
        status: "IN_PROGRESS",
        actualStartDate: current.actualStartDate ?? new Date()
      },
      include: workOrderInclude
    });

    const machine = await tx.machine.update({
      where: { id: targetOperation?.machineId ?? current.machineId },
      data: { status: "RUNNING" }
    });

    await recordAuditLog(
      {
        actorId: actor?.id,
        action: "WORK_ORDER_STARTED",
        entityType: "WorkOrder",
        entityId: updated.id,
        summary: `${updated.orderNo} iş emri başlatıldı`,
        metadata: {
          orderNo: updated.orderNo,
          operationId: operation?.id,
          operationName: operation?.operationName,
          machineId: machine.id
        }
      },
      tx
    );

    return { workOrder: updated, operation, machine };
  });

  if (result.operation) {
    emitEvent("workOrderOperation:updated", result.operation);
  }
  emitEvent("workOrder:updated", result.workOrder);
  emitEvent("machine:statusChanged", result.machine);
  return result.workOrder;
}

export async function pauseWorkOrder(id, actor) {
  const current = await prisma.workOrder.findUnique({
    where: { id },
    include: {
      operations: {
        orderBy: { sequenceNo: "asc" }
      }
    }
  });

  if (!current) {
    throw new ApiError(404, "Work order not found");
  }

  if (current.status !== "IN_PROGRESS") {
    throw new ApiError(400, "Only in-progress work orders can be paused");
  }

  const activeOperation = current.operations.find((operation) => operation.status === "IN_PROGRESS");

  const result = await prisma.$transaction(async (tx) => {
    let operation = null;

    if (current.operations.length) {
      if (!activeOperation) {
        throw new ApiError(400, "No in-progress operation can be paused for this work order");
      }

      operation = await tx.workOrderOperation.update({
        where: { id: activeOperation.id },
        data: { status: "PAUSED" },
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

    const updated = await tx.workOrder.update({
      where: { id },
      data: { status: "PAUSED" },
      include: workOrderInclude
    });

    let machine = null;

    const machineId = activeOperation?.machineId ?? current.machineId;

    if (machineId) {
      machine = await tx.machine.update({
        where: { id: machineId },
        data: { status: "STOPPED" }
      });
    }

    await recordAuditLog(
      {
        actorId: actor?.id,
        action: "WORK_ORDER_PAUSED",
        entityType: "WorkOrder",
        entityId: updated.id,
        summary: `${updated.orderNo} iş emri duraklatıldı`,
        metadata: {
          orderNo: updated.orderNo,
          operationId: operation?.id,
          operationName: operation?.operationName,
          machineId
        }
      },
      tx
    );

    return { workOrder: updated, operation, machine };
  });

  if (result.operation) {
    emitEvent("workOrderOperation:updated", result.operation);
  }
  emitEvent("workOrder:updated", result.workOrder);
  if (result.machine) {
    emitEvent("machine:statusChanged", result.machine);
  }
  return result.workOrder;
}

export async function completeWorkOrder(actor, id) {
  const current = await prisma.workOrder.findUnique({ where: { id } });

  if (!current) {
    throw new ApiError(404, "Work order not found");
  }

  if (!["IN_PROGRESS", "PAUSED"].includes(current.status)) {
    throw new ApiError(400, "Only started work orders can be completed");
  }

  if (current.producedQuantity <= 0) {
    throw new ApiError(400, "Production quantity must be logged before completing a work order");
  }

  if (actor.role === "OPERATOR" && current.producedQuantity < current.plannedQuantity) {
    throw new ApiError(400, `Work order cannot be completed before planned quantity is produced (${current.producedQuantity}/${current.plannedQuantity})`);
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.workOrder.update({
      where: { id },
      data: {
        status: "COMPLETED",
        actualEndDate: new Date()
      },
      include: workOrderInclude
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
        actorId: actor?.id,
        action: "WORK_ORDER_COMPLETED",
        entityType: "WorkOrder",
        entityId: updated.id,
        summary: `${updated.orderNo} iş emri tamamlandı`,
        metadata: {
          orderNo: updated.orderNo,
          plannedQuantity: current.plannedQuantity,
          producedQuantity: current.producedQuantity,
          scrapQuantity: current.scrapQuantity,
          managerOverride: actor?.role !== "OPERATOR" && current.producedQuantity < current.plannedQuantity
        }
      },
      tx
    );

    return { workOrder: updated, machine };
  });

  emitEvent("workOrder:updated", result.workOrder);
  emitEvent("machine:statusChanged", result.machine);
  return result.workOrder;
}
