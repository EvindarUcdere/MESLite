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

function sumProductionLogs(productionLogs) {
  return productionLogs.reduce(
    (acc, log) => ({
      producedQuantity: acc.producedQuantity + log.producedQuantity,
      scrapQuantity: acc.scrapQuantity + log.scrapQuantity
    }),
    { producedQuantity: 0, scrapQuantity: 0 }
  );
}

function isFinalProductLog(log) {
  if (!log.workOrderOperationId) {
    return true;
  }

  const finalOperation = log.workOrder?.operations?.at(-1);
  return finalOperation?.id === log.workOrderOperationId;
}

function mapScrapTrackingItem(log) {
  const plannedQuantity = log.workOrder?.plannedQuantity ?? 0;
  const producedQuantity = log.workOrder?.producedQuantity ?? 0;
  const missingQuantity = Math.max(plannedQuantity - producedQuantity, 0);
  const disposition = log.scrapDisposition ?? "PENDING_REVIEW";

  let priority = "INFO";
  if (missingQuantity > 0 && ["SCRAP", "REPRODUCE", "PENDING_REVIEW"].includes(disposition)) {
    priority = "CRITICAL";
  } else if (log.scrapQuantity > 0) {
    priority = "WARNING";
  }

  return {
    id: log.id,
    orderNo: log.workOrder?.orderNo,
    productCode: log.workOrder?.product?.code,
    productName: log.workOrder?.product?.name,
    plannedQuantity,
    producedQuantity,
    workOrderScrapQuantity: log.workOrder?.scrapQuantity ?? 0,
    missingQuantity,
    logProducedQuantity: log.producedQuantity,
    logScrapQuantity: log.scrapQuantity,
    scrapReason: log.scrapReason ?? "UNKNOWN",
    scrapDisposition: disposition,
    scrapResolutionQuantity: log.scrapResolutionQuantity ?? 0,
    scrapDispositionNote: log.scrapDispositionNote,
    machineCode: log.machine?.code,
    machineName: log.machine?.name,
    operatorName: log.operator?.name,
    operationName: log.workOrderOperation?.operationName,
    createdAt: log.createdAt,
    priority
  };
}

export async function getSummary() {
  const { start, end } = getTodayRange();
  const now = new Date();

  const [
    activeWorkOrders,
    completedWorkOrders,
    pausedWorkOrders,
    overdueWorkOrders,
    runningMachines,
    stoppedMachines,
    openAlerts,
    criticalAlerts,
    productionTotals,
    todayProductionLogs,
    machineStatusGroups,
    workOrderStatusGroups,
    qualityStatusGroups
  ] = await Promise.all([
    prisma.workOrder.count({ where: { status: { in: ["PLANNED", "IN_PROGRESS", "PAUSED"] } } }),
    prisma.workOrder.count({ where: { status: "COMPLETED" } }),
    prisma.workOrder.count({ where: { status: "PAUSED" } }),
    prisma.workOrder.count({
      where: {
        status: { in: ["PLANNED", "IN_PROGRESS", "PAUSED"] },
        plannedEndDate: { lt: now }
      }
    }),
    prisma.machine.count({ where: { status: "RUNNING" } }),
    prisma.machine.count({ where: { status: { in: ["STOPPED", "MAINTENANCE"] } } }),
    prisma.productionAlert.count({ where: { status: { in: ["OPEN", "IN_REVIEW"] } } }),
    prisma.productionAlert.count({ where: { status: { in: ["OPEN", "IN_REVIEW"] }, severity: "CRITICAL" } }),
    prisma.workOrder.aggregate({
      _sum: {
        producedQuantity: true,
        scrapQuantity: true
      }
    }),
    prisma.productionLog.findMany({
      where: {
        createdAt: {
          gte: start,
          lt: end
        }
      },
      include: {
        workOrder: {
          include: {
            operations: {
              select: {
                id: true,
                sequenceNo: true
              },
              orderBy: {
                sequenceNo: "asc"
              }
            }
          }
        }
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
  const todayProcessTotals = sumProductionLogs(todayProductionLogs);
  const todayFinalProductTotals = sumProductionLogs(todayProductionLogs.filter(isFinalProductLog));
  const todayProducedQuantity = todayFinalProductTotals.producedQuantity;
  const todayScrapQuantity = todayProcessTotals.scrapQuantity;
  const todayFinalScrapQuantity = todayFinalProductTotals.scrapQuantity;
  const todayProcessProducedQuantity = todayProcessTotals.producedQuantity;
  const todayScrapRate =
    todayProducedQuantity > 0 ? Number(((todayFinalScrapQuantity / todayProducedQuantity) * 100).toFixed(2)) : 0;

  return {
    activeWorkOrders,
    completedWorkOrders,
    pausedWorkOrders,
    overdueWorkOrders,
    runningMachines,
    stoppedMachines,
    openAlerts,
    criticalAlerts,
    producedQuantity,
    scrapQuantity,
    scrapRate,
    todayProducedQuantity,
    todayScrapQuantity,
    todayScrapRate,
    todayFinalScrapQuantity,
    todayProcessProducedQuantity,
    machineStatusCounts: normalizeGroupCounts(machineStatusGroups, "status"),
    workOrderStatusCounts: normalizeGroupCounts(workOrderStatusGroups, "status"),
    qualityStatusCounts: normalizeGroupCounts(qualityStatusGroups, "status")
  };
}

export async function getLiveOverview() {
  const { start: operatorNotesStart } = getLast24HoursRange();

  const [activeWorkOrders, machines, recentProductionLogs, operatorNotes, openAlerts, recentQualityChecks, pendingQualityOperations, scrapTrackingLogs] = await Promise.all([
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
    }),
    prisma.workOrderOperation.findMany({
      where: {
        status: "COMPLETED",
        producedQuantity: { gt: 0 },
        qualityChecks: { none: {} },
        OR: [
          { operationName: { contains: "kalite", mode: "insensitive" } },
          { operationName: { contains: "quality", mode: "insensitive" } },
          { operationName: { contains: "kontrol", mode: "insensitive" } }
        ]
      },
      include: {
        workOrder: { include: { product: true } },
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
      orderBy: [{ completedAt: "desc" }, { updatedAt: "desc" }],
      take: 10
    }),
    prisma.productionLog.findMany({
      where: {
        scrapQuantity: { gt: 0 }
      },
      include: {
        workOrder: {
          include: {
            product: true
          }
        },
        workOrderOperation: true,
        operator: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        },
        machine: true,
        shift: true
      },
      orderBy: { createdAt: "desc" },
      take: 20
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
    recentQualityChecks,
    pendingQualityOperations,
    scrapTrackingQueue: scrapTrackingLogs.map(mapScrapTrackingItem)
  };
}
