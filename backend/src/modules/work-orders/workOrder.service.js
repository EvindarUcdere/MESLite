import { prisma } from "../../config/db.js";
import { emitEvent } from "../../config/socket.js";
import { ApiError } from "../../utils/ApiError.js";

const workOrderInclude = {
  product: true,
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
      attachments: true
    },
    orderBy: { createdAt: "desc" },
    take: 5
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
  const workOrder = await prisma.workOrder.create({
    data: {
      ...data,
      plannedStartDate: data.plannedStartDate ? new Date(data.plannedStartDate) : undefined,
      plannedEndDate: data.plannedEndDate ? new Date(data.plannedEndDate) : undefined,
      createdById: userId
    },
    include: workOrderInclude
  });

  emitEvent("workOrder:updated", workOrder);
  return workOrder;
}

export async function updateWorkOrderStatus(id, status) {
  const statusDates = {
    ...(status === "IN_PROGRESS" ? { actualStartDate: new Date() } : {}),
    ...(status === "COMPLETED" ? { actualEndDate: new Date() } : {})
  };

  const workOrder = await prisma.workOrder.update({
    where: { id },
    data: { status, ...statusDates },
    include: workOrderInclude
  });

  emitEvent("workOrder:updated", workOrder);
  return workOrder;
}

export async function assignOperator(id, operatorId) {
  const operator = await prisma.user.findUnique({ where: { id: operatorId } });

  if (!operator || operator.role !== "OPERATOR" || !operator.isActive) {
    throw new ApiError(400, "Active operator user is required");
  }

  const workOrder = await prisma.workOrder.update({
    where: { id },
    data: { assignedOperatorId: operatorId },
    include: workOrderInclude
  });

  emitEvent("workOrder:updated", workOrder);
  return workOrder;
}

export async function assignMachine(id, machineId) {
  const machine = await prisma.machine.findUnique({ where: { id: machineId } });

  if (!machine || !machine.isActive) {
    throw new ApiError(400, "Active machine is required");
  }

  const workOrder = await prisma.workOrder.update({
    where: { id },
    data: { machineId },
    include: workOrderInclude
  });

  emitEvent("workOrder:updated", workOrder);
  return workOrder;
}

export async function startWorkOrder(id) {
  const current = await prisma.workOrder.findUnique({ where: { id } });

  if (!current) {
    throw new ApiError(404, "Work order not found");
  }

  if (["COMPLETED", "CANCELLED"].includes(current.status)) {
    throw new ApiError(400, "Completed or cancelled work orders cannot be started");
  }

  if (!current.machineId || !current.assignedOperatorId) {
    throw new ApiError(400, "Machine and operator must be assigned before starting production");
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.workOrder.update({
      where: { id },
      data: {
        status: "IN_PROGRESS",
        actualStartDate: current.actualStartDate ?? new Date()
      },
      include: workOrderInclude
    });

    const machine = await tx.machine.update({
      where: { id: current.machineId },
      data: { status: "RUNNING" }
    });

    return { workOrder: updated, machine };
  });

  emitEvent("workOrder:updated", result.workOrder);
  emitEvent("machine:statusChanged", result.machine);
  return result.workOrder;
}

export async function pauseWorkOrder(id) {
  const current = await prisma.workOrder.findUnique({ where: { id } });

  if (!current) {
    throw new ApiError(404, "Work order not found");
  }

  if (current.status !== "IN_PROGRESS") {
    throw new ApiError(400, "Only in-progress work orders can be paused");
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.workOrder.update({
      where: { id },
      data: { status: "PAUSED" },
      include: workOrderInclude
    });

    let machine = null;

    if (current.machineId) {
      machine = await tx.machine.update({
        where: { id: current.machineId },
        data: { status: "STOPPED" }
      });
    }

    return { workOrder: updated, machine };
  });

  emitEvent("workOrder:updated", result.workOrder);
  emitEvent("machine:statusChanged", result.machine);
  return result.workOrder;
}

export async function completeWorkOrder(id) {
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

    return { workOrder: updated, machine };
  });

  emitEvent("workOrder:updated", result.workOrder);
  emitEvent("machine:statusChanged", result.machine);
  return result.workOrder;
}
