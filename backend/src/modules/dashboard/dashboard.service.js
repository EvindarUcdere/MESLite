import { prisma } from "../../config/db.js";

function getTodayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return { start, end };
}

function getLast24HoursRange() {
  const start = new Date();
  start.setHours(start.getHours() - 24);

  return { start };
}

function normalizeGroupCounts(groups, key) {
  return groups.reduce((acc, item) => {
    acc[item[key]] = item._count._all;
    return acc;
  }, {});
}

function calculateProgress(workOrder) {
  if (workOrder.plannedQuantity <= 0) {
    return 0;
  }

  return Number(((workOrder.producedQuantity / workOrder.plannedQuantity) * 100).toFixed(2));
}

export async function getSummary() {
  const { start, end } = getTodayRange();

  const [
    activeWorkOrders,
    completedWorkOrders,
    runningMachines,
    stoppedMachines,
    productionTotals,
    todayProductionTotals,
    machineStatusGroups,
    workOrderStatusGroups,
    qualityStatusGroups
  ] = await Promise.all([
    prisma.workOrder.count({ where: { status: { in: ["PLANNED", "IN_PROGRESS", "PAUSED"] } } }),
    prisma.workOrder.count({ where: { status: "COMPLETED" } }),
    prisma.machine.count({ where: { status: "RUNNING" } }),
    prisma.machine.count({ where: { status: { in: ["STOPPED", "MAINTENANCE"] } } }),
    prisma.workOrder.aggregate({
      _sum: {
        producedQuantity: true,
        scrapQuantity: true
      }
    }),
    prisma.productionLog.aggregate({
      where: {
        createdAt: {
          gte: start,
          lt: end
        }
      },
      _sum: {
        producedQuantity: true,
        scrapQuantity: true
      }
    }),
    prisma.machine.groupBy({
      by: ["status"],
      _count: { _all: true }
    }),
    prisma.workOrder.groupBy({
      by: ["status"],
      _count: { _all: true }
    }),
    prisma.qualityCheck.groupBy({
      by: ["status"],
      _count: { _all: true }
    })
  ]);

  const producedQuantity = productionTotals._sum.producedQuantity ?? 0;
  const scrapQuantity = productionTotals._sum.scrapQuantity ?? 0;
  const scrapRate = producedQuantity > 0 ? Number(((scrapQuantity / producedQuantity) * 100).toFixed(2)) : 0;
  const todayProducedQuantity = todayProductionTotals._sum.producedQuantity ?? 0;
  const todayScrapQuantity = todayProductionTotals._sum.scrapQuantity ?? 0;
  const todayScrapRate = todayProducedQuantity > 0 ? Number(((todayScrapQuantity / todayProducedQuantity) * 100).toFixed(2)) : 0;

  return {
    activeWorkOrders,
    completedWorkOrders,
    runningMachines,
    stoppedMachines,
    producedQuantity,
    scrapQuantity,
    scrapRate,
    todayProducedQuantity,
    todayScrapQuantity,
    todayScrapRate,
    machineStatusCounts: normalizeGroupCounts(machineStatusGroups, "status"),
    workOrderStatusCounts: normalizeGroupCounts(workOrderStatusGroups, "status"),
    qualityStatusCounts: normalizeGroupCounts(qualityStatusGroups, "status")
  };
}

export async function getLiveOverview() {
  const { start: operatorNotesStart } = getLast24HoursRange();

  const [activeWorkOrders, machines, recentProductionLogs, operatorNotes, openAlerts, recentQualityChecks] = await Promise.all([
    prisma.workOrder.findMany({
      where: { status: { in: ["PLANNED", "IN_PROGRESS", "PAUSED"] } },
      include: {
        product: true,
        machine: true,
        assignedOperator: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        }
      },
      orderBy: [{ status: "asc" }, { plannedStartDate: "asc" }],
      take: 20
    }),
    prisma.machine.findMany({
      include: { productionLine: true },
      orderBy: [{ status: "asc" }, { code: "asc" }]
    }),
    prisma.productionLog.findMany({
      include: {
        workOrder: { include: { product: true } },
        operator: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        },
        machine: true,
        shift: true,
        attachments: true
      },
      orderBy: { createdAt: "desc" },
      take: 10
    }),
    prisma.productionLog.findMany({
      where: {
        createdAt: {
          gte: operatorNotesStart
        },
        note: {
          not: null
        }
      },
      include: {
        workOrder: { include: { product: true } },
        operator: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        },
        machine: true,
        shift: true,
        attachments: true
      },
      orderBy: { createdAt: "desc" },
      take: 20
    }),
    prisma.productionAlert.findMany({
      where: { status: { in: ["OPEN", "IN_REVIEW"] } },
      include: {
        workOrder: { include: { product: true } },
        productionLog: {
          include: {
            machine: true,
            attachments: true,
            operator: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true
              }
            }
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
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        },
        events: {
          include: {
            actor: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true
              }
            }
          },
          orderBy: { createdAt: "asc" }
        }
      },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      take: 20
    }),
    prisma.qualityCheck.findMany({
      include: {
        workOrder: { include: { product: true } },
        checkedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        }
      },
      orderBy: { checkedAt: "desc" },
      take: 10
    })
  ]);

  return {
    activeWorkOrders: activeWorkOrders.map((workOrder) => ({
      ...workOrder,
      progressPercent: calculateProgress(workOrder)
    })),
    machines,
    recentProductionLogs,
    operatorNotes: operatorNotes.filter((log) => log.note?.trim()),
    openAlerts,
    recentQualityChecks
  };
}
