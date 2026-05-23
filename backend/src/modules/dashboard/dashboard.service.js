import { prisma } from "../../config/db.js";

export async function getSummary() {
  const [activeWorkOrders, completedWorkOrders, runningMachines, stoppedMachines, productionTotals] = await Promise.all([
    prisma.workOrder.count({ where: { status: { in: ["PLANNED", "IN_PROGRESS", "PAUSED"] } } }),
    prisma.workOrder.count({ where: { status: "COMPLETED" } }),
    prisma.machine.count({ where: { status: "RUNNING" } }),
    prisma.machine.count({ where: { status: { in: ["STOPPED", "MAINTENANCE"] } } }),
    prisma.workOrder.aggregate({
      _sum: {
        producedQuantity: true,
        scrapQuantity: true
      }
    })
  ]);

  const producedQuantity = productionTotals._sum.producedQuantity ?? 0;
  const scrapQuantity = productionTotals._sum.scrapQuantity ?? 0;
  const scrapRate = producedQuantity > 0 ? Number(((scrapQuantity / producedQuantity) * 100).toFixed(2)) : 0;

  return {
    activeWorkOrders,
    completedWorkOrders,
    runningMachines,
    stoppedMachines,
    producedQuantity,
    scrapQuantity,
    scrapRate
  };
}
