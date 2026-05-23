import { prisma } from "../../config/db.js";
import { emitEvent } from "../../config/socket.js";

export function findMachines() {
  return prisma.machine.findMany({
    include: { productionLine: true },
    orderBy: { createdAt: "desc" }
  });
}

export function findMachineById(id) {
  return prisma.machine.findUnique({
    where: { id },
    include: {
      productionLine: true,
      machineStatusLogs: {
        orderBy: { createdAt: "desc" },
        take: 20
      }
    }
  });
}

export function createMachine(data) {
  return prisma.machine.create({
    data,
    include: { productionLine: true }
  });
}

export function updateMachine(id, data) {
  return prisma.machine.update({
    where: { id },
    data,
    include: { productionLine: true }
  });
}

export async function updateMachineStatus(machineId, userId, { status, reason }) {
  const result = await prisma.$transaction(async (tx) => {
    const machine = await tx.machine.update({
      where: { id: machineId },
      data: { status }
    });

    const log = await tx.machineStatusLog.create({
      data: {
        machineId,
        status,
        reason,
        changedById: userId
      }
    });

    return { machine, log };
  });

  emitEvent("machine:statusChanged", result.machine);
  return result;
}
