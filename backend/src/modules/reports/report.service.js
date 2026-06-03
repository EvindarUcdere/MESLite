import { prisma } from "../../config/db.js";

function scrapRate(producedQuantity, scrapQuantity) {
  return producedQuantity > 0 ? Number(((scrapQuantity / producedQuantity) * 100).toFixed(2)) : 0;
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] ?? "UNKNOWN";
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function sumScrapByReason(productionLogs) {
  return productionLogs.reduce((acc, log) => {
    if (log.scrapQuantity <= 0) {
      return acc;
    }

    const reason = log.scrapReason ?? "UNKNOWN";
    acc[reason] = (acc[reason] ?? 0) + log.scrapQuantity;
    return acc;
  }, {});
}

function countByReason(items) {
  return items.reduce((acc, item) => {
    acc[item.reason] = (acc[item.reason] ?? 0) + 1;
    return acc;
  }, {});
}

function createMetricGroup(base) {
  return {
    ...base,
    producedQuantity: 0,
    scrapQuantity: 0,
    logCount: 0
  };
}

function addLogMetrics(item, log) {
  item.producedQuantity += log.producedQuantity;
  item.scrapQuantity += log.scrapQuantity;
  item.logCount += 1;
}

function sortByProducedThenScrap(items) {
  return items.sort((first, second) => {
    if (first.shiftId === "UNASSIGNED" && second.shiftId !== "UNASSIGNED") {
      return 1;
    }

    if (second.shiftId === "UNASSIGNED" && first.shiftId !== "UNASSIGNED") {
      return -1;
    }

    if (second.producedQuantity !== first.producedQuantity) {
      return second.producedQuantity - first.producedQuantity;
    }

    return first.scrapQuantity - second.scrapQuantity;
  });
}

export async function getOverviewReport() {
  const [workOrders, productionLogs, qualityChecks, machines, machineStatusLogs, operationDowntimes] = await Promise.all([
    prisma.workOrder.findMany({
      include: {
        product: true,
        machine: true,
        assignedOperator: {
          select: { id: true, name: true, email: true, role: true }
        }
      },
      orderBy: { updatedAt: "desc" }
    }),
    prisma.productionLog.findMany({
      include: {
        workOrder: { include: { product: true } },
        machine: true,
        shift: true,
        operator: {
          select: { id: true, name: true, email: true, role: true }
        }
      },
      orderBy: { createdAt: "desc" }
    }),
    prisma.qualityCheck.findMany({
      include: {
        workOrder: { include: { product: true } },
        checkedBy: {
          select: { id: true, name: true, email: true, role: true }
        }
      },
      orderBy: { checkedAt: "desc" }
    }),
    prisma.machine.findMany({ include: { productionLine: true } }),
    prisma.machineStatusLog.findMany({
      where: { status: { in: ["STOPPED", "MAINTENANCE"] } },
      orderBy: { createdAt: "desc" },
      take: 100
    }),
    prisma.operationDowntime.findMany({
      include: {
        workOrder: { include: { product: true } },
        workOrderOperation: true,
        machine: true,
        operator: {
          select: { id: true, name: true, email: true, role: true }
        },
        shift: true
      },
      orderBy: { startedAt: "desc" },
      take: 250
    })
  ]);

  const producedQuantity = productionLogs.reduce((sum, log) => sum + log.producedQuantity, 0);
  const scrapQuantity = productionLogs.reduce((sum, log) => sum + log.scrapQuantity, 0);
  const defectQuantity = qualityChecks.reduce((sum, check) => sum + check.defectQuantity, 0);

  const machinePerformanceMap = productionLogs.reduce((acc, log) => {
    const machineId = log.machineId;

    if (!acc[machineId]) {
      acc[machineId] = {
        machineId,
        machineCode: log.machine.code,
        machineName: log.machine.name,
        producedQuantity: 0,
        scrapQuantity: 0,
        logCount: 0
      };
    }

    acc[machineId].producedQuantity += log.producedQuantity;
    acc[machineId].scrapQuantity += log.scrapQuantity;
    acc[machineId].logCount += 1;
    return acc;
  }, {});

  const productPerformanceMap = productionLogs.reduce((acc, log) => {
    const productId = log.workOrder.productId;

    if (!acc[productId]) {
      acc[productId] = {
        productId,
        productCode: log.workOrder.product.code,
        productName: log.workOrder.product.name,
        producedQuantity: 0,
        scrapQuantity: 0
      };
    }

    acc[productId].producedQuantity += log.producedQuantity;
    acc[productId].scrapQuantity += log.scrapQuantity;
    return acc;
  }, {});

  const shiftPerformanceMap = {};
  const operatorShiftPerformanceMap = {};
  const machineShiftPerformanceMap = {};
  const downtimeByShiftMap = {};
  const downtimeByMachineMap = {};
  const downtimeByOperationMap = {};

  productionLogs.forEach((log) => {
    const shiftId = log.shiftId ?? "UNASSIGNED";
    const shiftName = log.shift?.name ?? "Vardiya Yok";
    const shiftTimeRange = log.shift ? `${log.shift.startTime}-${log.shift.endTime}` : "-";

    if (!shiftPerformanceMap[shiftId]) {
      shiftPerformanceMap[shiftId] = createMetricGroup({
        shiftId,
        shiftName,
        shiftTimeRange,
        operatorIds: new Set(),
        machineIds: new Set()
      });
    }

    addLogMetrics(shiftPerformanceMap[shiftId], log);
    shiftPerformanceMap[shiftId].operatorIds.add(log.operatorId);
    shiftPerformanceMap[shiftId].machineIds.add(log.machineId);

    const operatorShiftKey = `${shiftId}:${log.operatorId}`;
    if (!operatorShiftPerformanceMap[operatorShiftKey]) {
      operatorShiftPerformanceMap[operatorShiftKey] = createMetricGroup({
        shiftId,
        shiftName,
        shiftTimeRange,
        operatorId: log.operatorId,
        operatorName: log.operator.name
      });
    }
    addLogMetrics(operatorShiftPerformanceMap[operatorShiftKey], log);

    const machineShiftKey = `${shiftId}:${log.machineId}`;
    if (!machineShiftPerformanceMap[machineShiftKey]) {
      machineShiftPerformanceMap[machineShiftKey] = createMetricGroup({
        shiftId,
        shiftName,
        shiftTimeRange,
        machineId: log.machineId,
        machineCode: log.machine.code,
        machineName: log.machine.name
      });
    }
    addLogMetrics(machineShiftPerformanceMap[machineShiftKey], log);
  });

  operationDowntimes.forEach((downtime) => {
    const shiftId = downtime.shiftId ?? "UNASSIGNED";
    const shiftName = downtime.shift?.name ?? "Vardiya Yok";
    const machineId = downtime.machineId ?? "UNASSIGNED";
    const machineCode = downtime.machine?.code ?? "Makine Yok";
    const machineName = downtime.machine?.name ?? "Makine Yok";
    const operationId = downtime.workOrderOperationId;
    const operationName = downtime.workOrderOperation.operationName;

    if (!downtimeByShiftMap[shiftId]) {
      downtimeByShiftMap[shiftId] = { shiftId, shiftName, totalCount: 0, reasonCounts: {} };
    }
    downtimeByShiftMap[shiftId].totalCount += 1;
    downtimeByShiftMap[shiftId].reasonCounts[downtime.reason] = (downtimeByShiftMap[shiftId].reasonCounts[downtime.reason] ?? 0) + 1;

    if (!downtimeByMachineMap[machineId]) {
      downtimeByMachineMap[machineId] = { machineId, machineCode, machineName, totalCount: 0, reasonCounts: {} };
    }
    downtimeByMachineMap[machineId].totalCount += 1;
    downtimeByMachineMap[machineId].reasonCounts[downtime.reason] = (downtimeByMachineMap[machineId].reasonCounts[downtime.reason] ?? 0) + 1;

    if (!downtimeByOperationMap[operationId]) {
      downtimeByOperationMap[operationId] = {
        operationId,
        operationName,
        orderNo: downtime.workOrder.orderNo,
        productCode: downtime.workOrder.product.code,
        totalCount: 0,
        reasonCounts: {}
      };
    }
    downtimeByOperationMap[operationId].totalCount += 1;
    downtimeByOperationMap[operationId].reasonCounts[downtime.reason] =
      (downtimeByOperationMap[operationId].reasonCounts[downtime.reason] ?? 0) + 1;
  });

  const machinePerformance = Object.values(machinePerformanceMap).map((item) => ({
    ...item,
    scrapRate: scrapRate(item.producedQuantity, item.scrapQuantity)
  }));

  const productPerformance = Object.values(productPerformanceMap).map((item) => ({
    ...item,
    scrapRate: scrapRate(item.producedQuantity, item.scrapQuantity)
  }));

  const shiftPerformance = sortByProducedThenScrap(
    Object.values(shiftPerformanceMap).map((item) => ({
      ...item,
      operatorCount: item.operatorIds.size,
      machineCount: item.machineIds.size,
      scrapRate: scrapRate(item.producedQuantity, item.scrapQuantity),
      operatorIds: undefined,
      machineIds: undefined
    }))
  );

  const operatorShiftPerformance = sortByProducedThenScrap(
    Object.values(operatorShiftPerformanceMap).map((item) => ({
      ...item,
      scrapRate: scrapRate(item.producedQuantity, item.scrapQuantity)
    }))
  );

  const machineShiftPerformance = sortByProducedThenScrap(
    Object.values(machineShiftPerformanceMap).map((item) => ({
      ...item,
      scrapRate: scrapRate(item.producedQuantity, item.scrapQuantity)
    }))
  );

  return {
    summary: {
      workOrderCount: workOrders.length,
      productionLogCount: productionLogs.length,
      machineCount: machines.length,
      producedQuantity,
      scrapQuantity,
      scrapRate: scrapRate(producedQuantity, scrapQuantity),
      qualityCheckCount: qualityChecks.length,
      defectQuantity
    },
    workOrderStatusCounts: countBy(workOrders, "status"),
    machineStatusCounts: countBy(machines, "status"),
    machineDowntimeReasonCounts: countBy(machineStatusLogs, "reason"),
    operationDowntimeReasonCounts: countByReason(operationDowntimes),
    operationDowntimeByShift: Object.values(downtimeByShiftMap).sort((first, second) => second.totalCount - first.totalCount),
    operationDowntimeByMachine: Object.values(downtimeByMachineMap).sort((first, second) => second.totalCount - first.totalCount),
    operationDowntimeByOperation: Object.values(downtimeByOperationMap).sort((first, second) => second.totalCount - first.totalCount),
    recentOperationDowntimes: operationDowntimes.slice(0, 10),
    qualityStatusCounts: countBy(qualityChecks, "status"),
    machinePerformance,
    productPerformance,
    shiftPerformance,
    operatorShiftPerformance,
    machineShiftPerformance,
    scrapReasonCounts: sumScrapByReason(productionLogs),
    recentProductionLogs: productionLogs.slice(0, 10),
    recentQualityChecks: qualityChecks.slice(0, 10)
  };
}
