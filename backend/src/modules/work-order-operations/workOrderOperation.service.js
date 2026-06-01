import { prisma } from "../../config/db.js";
import { emitEvent } from "../../config/socket.js";
import { ApiError } from "../../utils/ApiError.js";

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
  }
};

function assertOperatorCanUseOperation(actor, operation) {
  if (actor.role === "OPERATOR" && operation.assignedOperatorId !== actor.id) {
    throw new ApiError(403, "Operator can only manage assigned operations");
  }
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

  if (!["READY", "PAUSED"].includes(current.status)) {
    throw new ApiError(400, "Only ready or paused operations can be started");
  }

  const result = await prisma.$transaction(async (tx) => {
    const operation = await tx.workOrderOperation.update({
      where: { id },
      data: {
        status: "IN_PROGRESS",
        startedAt: current.startedAt ?? new Date()
      },
      include: operationInclude
    });

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

    const fullWorkOrder = await getWorkOrderForEmit(current.workOrderId, tx);
    return { operation, workOrder: fullWorkOrder ?? workOrder, machine };
  });

  emitEvent("workOrderOperation:updated", result.operation);
  emitEvent("workOrder:updated", result.workOrder);
  if (result.machine) {
    emitEvent("machine:statusChanged", result.machine);
  }

  return result.operation;
}

export async function pauseOperation(actor, id) {
  const current = await getOperationOrThrow(id);
  assertOperatorCanUseOperation(actor, current);

  if (current.status !== "IN_PROGRESS") {
    throw new ApiError(400, "Only in-progress operations can be paused");
  }

  const result = await prisma.$transaction(async (tx) => {
    const operation = await tx.workOrderOperation.update({
      where: { id },
      data: { status: "PAUSED" },
      include: operationInclude
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

    const workOrder = await getWorkOrderForEmit(current.workOrderId, tx);
    return { operation, workOrder, machine };
  });

  emitEvent("workOrderOperation:updated", result.operation);
  emitEvent("workOrder:updated", result.workOrder);
  if (result.machine) {
    emitEvent("machine:statusChanged", result.machine);
  }

  return result.operation;
}

export async function completeOperation(actor, id) {
  const current = await getOperationOrThrow(id);
  assertOperatorCanUseOperation(actor, current);

  if (current.status !== "IN_PROGRESS") {
    throw new ApiError(400, "Only in-progress operations can be completed");
  }

  if (current.producedQuantity <= 0 && current.scrapQuantity <= 0) {
    throw new ApiError(400, "Production or scrap quantity must be logged before completing an operation");
  }

  const result = await prisma.$transaction(async (tx) => {
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

  const updatedOperation = await getOperationOrThrow(id);
  const workOrder = await getWorkOrderForEmit(operation.workOrderId);

  emitEvent("operationMessage:created", message);
  emitEvent("workOrderOperation:updated", updatedOperation);
  emitEvent("workOrder:updated", workOrder);

  return message;
}
