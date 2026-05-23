import { prisma } from "../../config/db.js";
import { emitEvent } from "../../config/socket.js";

export function findMachines() {
  return prisma.machine.findMany({
    include: { productionLine: true },
    orderBy: { createdAt: "desc" }
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
