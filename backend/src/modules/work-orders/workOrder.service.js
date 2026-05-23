import { prisma } from "../../config/db.js";
import { emitEvent } from "../../config/socket.js";

export function findWorkOrders() {
  return prisma.workOrder.findMany({
    include: {
      product: true,
      machine: true,
      assignedOperator: true
    },
    orderBy: { createdAt: "desc" }
  });
}

export function findWorkOrderById(id) {
  return prisma.workOrder.findUnique({
    where: { id },
    include: {
      product: true,
      machine: true,
      assignedOperator: true,
      productionLogs: true,
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
    }
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
    data: { status, ...statusDates }
  });

  emitEvent("workOrder:updated", workOrder);
  return workOrder;
}
