import { prisma } from "../../config/db.js";

function scrapRate(producedQuantity, scrapQuantity) {
  return producedQuantity > 0 ? Number(((scrapQuantity / producedQuantity) * 100).toFixed(2)) : 0;
}

function parseReportDate(value, fallback) {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function getReportRange(query = {}) {
  const now = new Date();
  const defaultFrom = new Date(now);
  defaultFrom.setDate(defaultFrom.getDate() - 30);
  defaultFrom.setHours(0, 0, 0, 0);

  const defaultTo = new Date(now);
  defaultTo.setHours(23, 59, 59, 999);

  const from = parseReportDate(query.from ? `${query.from}T00:00:00.000Z` : null, defaultFrom);
  const to = parseReportDate(query.to ? `${query.to}T23:59:59.999Z` : null, defaultTo);

  return from <= to ? { from, to } : { from: defaultFrom, to: defaultTo };
}

function dateRangeFilter(field, range) {
  return {
    [field]: {
      gte: range.from,
      lte: range.to
    }
  };
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

function minutesBetween(start, end) {
  if (!start || !end) {
    return 0;
  }

  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
}

function sumDowntimeMinutes(downtimes, fallbackEnd = new Date()) {
  return downtimes.reduce((sum, downtime) => sum + minutesBetween(downtime.startedAt, downtime.endedAt ?? fallbackEnd), 0);
}

function createMetricGroup(base) {
  return {
    ...base,
    producedQuantity: 0,
    scrapQuantity: 0,
    logCount: 0
  };
}

function createTimeGroup(base) {
  return {
    ...base,
    operationCount: 0,
    completedOperationCount: 0,
    plannedMinutes: 0,
    actualMinutes: 0,
    downtimeMinutes: 0,
    netMinutes: 0,
    delayMinutes: 0
  };
}

function addTimeMetrics(group, item) {
  group.operationCount += 1;
  group.completedOperationCount += item.completedAt ? 1 : 0;
  group.plannedMinutes += item.plannedMinutes;
  group.actualMinutes += item.actualMinutes;
  group.downtimeMinutes += item.downtimeMinutes;
  group.netMinutes += item.netMinutes;
  group.delayMinutes += item.delayMinutes;
}

function finalizeTimeGroup(group) {
  return {
    ...group,
    avgDelayMinutes: group.operationCount > 0 ? Number((group.delayMinutes / group.operationCount).toFixed(1)) : 0,
    avgNetMinutes: group.operationCount > 0 ? Number((group.netMinutes / group.operationCount).toFixed(1)) : 0
  };
}

function addLogMetrics(item, log) {
  item.producedQuantity += log.producedQuantity;
  item.scrapQuantity += log.scrapQuantity;
  item.logCount += 1;
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

function groupDailyProduction(productionLogs) {
  const map = {};

  productionLogs.forEach((log) => {
    const day = log.createdAt.toISOString().slice(0, 10);

    if (!map[day]) {
      map[day] = {
        date: day,
        producedQuantity: 0,
        scrapQuantity: 0,
        logCount: 0
      };
    }

    map[day].producedQuantity += log.producedQuantity;
    map[day].scrapQuantity += log.scrapQuantity;
    map[day].logCount += 1;
  });

  return Object.values(map)
    .map((item) => ({
      ...item,
      scrapRate: scrapRate(item.producedQuantity, item.scrapQuantity)
    }))
    .sort((first, second) => first.date.localeCompare(second.date));
}

function buildManagementInsights({ summary, shiftPerformance, delayedOperations, operationDowntimeByMachine, operationDowntimeByShift, qualityDecisionByMachine }) {
  const insights = [];

  if (summary.scrapRate >= 10) {
    insights.push({
      type: "SCRAP_RISK",
      severity: "CRITICAL",
      title: "Fire oranı kritik seviyede",
      message: `Seçili dönemde fire oranı %${summary.scrapRate}. Kalite ve proses parametreleri birlikte incelenmeli.`
    });
  } else if (summary.scrapRate >= 5) {
    insights.push({
      type: "SCRAP_WARNING",
      severity: "WARNING",
      title: "Fire oranı izlenmeli",
      message: `Seçili dönemde fire oranı %${summary.scrapRate}. En yüksek fire üreten makine ve vardiya kontrol edilmeli.`
    });
  }

  const weakestShift = [...shiftPerformance].sort((first, second) => second.scrapRate - first.scrapRate)[0];
  if (weakestShift && weakestShift.scrapRate > 0) {
    insights.push({
      type: "SHIFT_SCRAP",
      severity: weakestShift.scrapRate >= 10 ? "CRITICAL" : "INFO",
      title: "Vardiya bazlı fire sinyali",
      message: `${weakestShift.shiftName} vardiyasında fire oranı %${weakestShift.scrapRate}. Operatör, malzeme ve makine kombinasyonu incelenebilir.`
    });
  }

  const mostDelayedOperation = delayedOperations[0];
  if (mostDelayedOperation) {
    insights.push({
      type: "DELAY",
      severity: mostDelayedOperation.delayMinutes >= 60 ? "WARNING" : "INFO",
      title: "Gecikme odağı",
      message: `${mostDelayedOperation.orderNo} / ${mostDelayedOperation.operationName} operasyonunda +${mostDelayedOperation.delayMinutes} dk gecikme var.`
    });
  }

  const downtimeMachine = operationDowntimeByMachine[0];
  if (downtimeMachine) {
    insights.push({
      type: "DOWNTIME_MACHINE",
      severity: downtimeMachine.totalCount >= 3 ? "WARNING" : "INFO",
      title: "Duruş yoğunluğu",
      message: `${downtimeMachine.machineCode} makinesinde ${downtimeMachine.totalCount} duruş kaydı var. Bakım ve malzeme bekleme nedenleri ayrıştırılmalı.`
    });
  }

  const downtimeShift = operationDowntimeByShift[0];
  if (downtimeShift) {
    insights.push({
      type: "DOWNTIME_SHIFT",
      severity: "INFO",
      title: "Vardiya duruş odağı",
      message: `${downtimeShift.shiftName} vardiyasında ${downtimeShift.totalCount} operasyon duruşu kaydedildi.`
    });
  }

  const qualityMachine = qualityDecisionByMachine[0];
  if (qualityMachine) {
    insights.push({
      type: "QUALITY_MACHINE",
      severity: qualityMachine.criticalCount > 0 ? "WARNING" : "INFO",
      title: "Kalite karar odağı",
      message: `${qualityMachine.machineCode} makinesinde ${qualityMachine.totalCount} kalite kararı oluştu. Geri işleme/hurda dağılımı kontrol edilmeli.`
    });
  }

  return insights.slice(0, 6);
}

function toDateInputValue(date) {
  return date.toISOString().slice(0, 10);
}

function addQualityDecisionMetric(map, key, base, alert) {
  if (!map[key]) {
    map[key] = {
      ...base,
      totalCount: 0,
      reworkCount: 0,
      scrapCount: 0,
      conditionalAcceptCount: 0,
      criticalCount: 0
    };
  }

  map[key].totalCount += 1;

  if (alert.qualityDecision === "REWORK_OPERATION") {
    map[key].reworkCount += 1;
  }

  if (alert.qualityDecision === "SCRAP") {
    map[key].scrapCount += 1;
  }

  if (alert.qualityDecision === "CONDITIONAL_ACCEPT") {
    map[key].conditionalAcceptCount += 1;
  }

  if (alert.severity === "CRITICAL") {
    map[key].criticalCount += 1;
  }
}

export async function getOverviewReport(query = {}) {
  const range = getReportRange(query);
  const [workOrders, productionLogs, qualityChecks, productionAlerts, machines, machineStatusLogs, operationDowntimes, workOrderOperations] = await Promise.all([
    prisma.workOrder.findMany({
      where: dateRangeFilter("updatedAt", range),
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
      where: dateRangeFilter("createdAt", range),
      include: {
        workOrder: {
          include: {
            product: true,
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
        },
        machine: true,
        shift: true,
        operator: {
          select: { id: true, name: true, email: true, role: true }
        }
      },
      orderBy: { createdAt: "desc" }
    }),
    prisma.qualityCheck.findMany({
      where: dateRangeFilter("checkedAt", range),
      include: {
        workOrder: { include: { product: true } },
        workOrderOperation: {
          include: {
            machine: true
          }
        },
        checkedBy: {
          select: { id: true, name: true, email: true, role: true }
        }
      },
      orderBy: { checkedAt: "desc" }
    }),
    prisma.productionAlert.findMany({
      where: {
        ...dateRangeFilter("updatedAt", range),
        qualityDecision: {
          not: null
        }
      },
      include: {
        workOrder: { include: { product: true } },
        productionLog: {
          include: {
            machine: true,
            workOrderOperation: true,
            operator: {
              select: { id: true, name: true, email: true, role: true }
            }
          }
        },
        reworkOperation: {
          include: {
            machine: true,
            assignedOperator: {
              select: { id: true, name: true, email: true, role: true }
            }
          }
        },
        createdBy: {
          select: { id: true, name: true, email: true, role: true }
        },
        resolvedBy: {
          select: { id: true, name: true, email: true, role: true }
        }
      },
      orderBy: { updatedAt: "desc" }
    }),
    prisma.machine.findMany({ include: { productionLine: true } }),
    prisma.machineStatusLog.findMany({
      where: { status: { in: ["STOPPED", "MAINTENANCE"] }, ...dateRangeFilter("createdAt", range) },
      orderBy: { createdAt: "desc" },
      take: 100
    }),
    prisma.operationDowntime.findMany({
      where: dateRangeFilter("startedAt", range),
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
    }),
    prisma.workOrderOperation.findMany({
      where: {
        startedAt: {
          not: null,
          gte: range.from,
          lte: range.to
        }
      },
      include: {
        routeOperation: true,
        workOrder: { include: { product: true } },
        machine: true,
        assignedOperator: {
          select: { id: true, name: true, email: true, role: true }
        },
        downtimes: true
      },
      orderBy: { updatedAt: "desc" },
      take: 250
    })
  ]);

  const finalProductLogs = productionLogs.filter(isFinalProductLog);
  const processTotals = sumProductionLogs(productionLogs);
  const finalProductTotals = sumProductionLogs(finalProductLogs);
  const producedQuantity = finalProductTotals.producedQuantity;
  const scrapQuantity = processTotals.scrapQuantity;
  const finalScrapQuantity = finalProductTotals.scrapQuantity;
  const processProducedQuantity = processTotals.producedQuantity;
  const defectQuantity = qualityChecks.reduce((sum, check) => sum + check.defectQuantity, 0);
  const qualityDecisionCounts = countBy(productionAlerts, "qualityDecision");
  const qualityReworkCount = qualityDecisionCounts.REWORK_OPERATION ?? 0;
  const qualityScrapDecisionCount = qualityDecisionCounts.SCRAP ?? 0;
  const qualityConditionalAcceptCount = qualityDecisionCounts.CONDITIONAL_ACCEPT ?? 0;

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

  const productPerformanceMap = finalProductLogs.reduce((acc, log) => {
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
  const timeByMachineMap = {};
  const timeByOperatorMap = {};
  const qualityDecisionByOperationMap = {};
  const qualityDecisionByMachineMap = {};
  const now = new Date();

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

  const operationTimePerformance = workOrderOperations.map((operation) => {
    const plannedMinutes = operation.routeOperation?.estimatedMinutes ?? 0;
    const actualMinutes = minutesBetween(operation.startedAt, operation.completedAt ?? now);
    const downtimeMinutes = sumDowntimeMinutes(operation.downtimes ?? [], operation.completedAt ?? now);
    const netMinutes = Math.max(actualMinutes - downtimeMinutes, 0);
    const delayMinutes = plannedMinutes > 0 ? Math.max(netMinutes - plannedMinutes, 0) : 0;

    const item = {
      operationId: operation.id,
      orderNo: operation.workOrder.orderNo,
      productCode: operation.workOrder.product.code,
      productName: operation.workOrder.product.name,
      operationName: operation.operationName,
      status: operation.status,
      machineId: operation.machineId,
      machineCode: operation.machine?.code ?? "Makine Yok",
      machineName: operation.machine?.name ?? "Makine Yok",
      operatorId: operation.assignedOperatorId,
      operatorName: operation.assignedOperator?.name ?? "Operatör Yok",
      plannedMinutes,
      actualMinutes,
      downtimeMinutes,
      netMinutes,
      delayMinutes,
      startedAt: operation.startedAt,
      completedAt: operation.completedAt
    };

    const machineKey = operation.machineId ?? "UNASSIGNED";
    if (!timeByMachineMap[machineKey]) {
      timeByMachineMap[machineKey] = createTimeGroup({
        machineId: machineKey,
        machineCode: item.machineCode,
        machineName: item.machineName
      });
    }
    addTimeMetrics(timeByMachineMap[machineKey], item);

    const operatorKey = operation.assignedOperatorId ?? "UNASSIGNED";
    if (!timeByOperatorMap[operatorKey]) {
      timeByOperatorMap[operatorKey] = createTimeGroup({
        operatorId: operatorKey,
        operatorName: item.operatorName
      });
    }
    addTimeMetrics(timeByOperatorMap[operatorKey], item);

    return item;
  });

  const delayedOperations = operationTimePerformance.filter((operation) => operation.delayMinutes > 0).sort((first, second) => second.delayMinutes - first.delayMinutes);
  const operationTimeByMachine = Object.values(timeByMachineMap).map(finalizeTimeGroup).sort((first, second) => second.delayMinutes - first.delayMinutes);
  const operationTimeByOperator = Object.values(timeByOperatorMap).map(finalizeTimeGroup).sort((first, second) => second.delayMinutes - first.delayMinutes);

  productionAlerts.forEach((alert) => {
    const operation = alert.reworkOperation ?? alert.productionLog.workOrderOperation;
    const machine = alert.reworkOperation?.machine ?? alert.productionLog.machine;
    const operationKey = operation?.id ?? "UNASSIGNED";
    const machineKey = machine?.id ?? "UNASSIGNED";

    addQualityDecisionMetric(
      qualityDecisionByOperationMap,
      operationKey,
      {
        operationId: operationKey,
        operationName: operation?.operationName ?? "Operasyon Yok",
        orderNo: alert.workOrder.orderNo,
        productCode: alert.workOrder.product.code,
        productName: alert.workOrder.product.name,
        machineCode: machine?.code ?? "Makine Yok",
        machineName: machine?.name ?? "Makine Yok"
      },
      alert
    );

    addQualityDecisionMetric(
      qualityDecisionByMachineMap,
      machineKey,
      {
        machineId: machineKey,
        machineCode: machine?.code ?? "Makine Yok",
        machineName: machine?.name ?? "Makine Yok"
      },
      alert
    );
  });

  const qualityDecisionByOperation = Object.values(qualityDecisionByOperationMap).sort((first, second) => second.totalCount - first.totalCount).slice(0, 10);
  const qualityDecisionByMachine = Object.values(qualityDecisionByMachineMap).sort((first, second) => second.totalCount - first.totalCount).slice(0, 10);
  const recentQualityDecisions = productionAlerts.slice(0, 10).map((alert) => ({
    id: alert.id,
    orderNo: alert.workOrder.orderNo,
    productCode: alert.workOrder.product.code,
    productName: alert.workOrder.product.name,
    decision: alert.qualityDecision,
    note: alert.qualityDecisionNote,
    severity: alert.severity,
    status: alert.status,
    operationName: alert.reworkOperation?.operationName ?? alert.productionLog.workOrderOperation?.operationName ?? "-",
    machineCode: alert.reworkOperation?.machine?.code ?? alert.productionLog.machine?.code ?? "-",
    operatorName: alert.reworkOperation?.assignedOperator?.name ?? alert.productionLog.operator?.name ?? "-",
    decidedByName: alert.resolvedBy?.name ?? alert.createdBy?.name ?? "-",
    updatedAt: alert.updatedAt
  }));

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

  const summary = {
    workOrderCount: workOrders.length,
    productionLogCount: productionLogs.length,
    machineCount: machines.length,
    producedQuantity,
    processProducedQuantity,
    scrapQuantity,
    finalScrapQuantity,
    scrapRate: scrapRate(producedQuantity, finalScrapQuantity),
    qualityCheckCount: qualityChecks.length,
    defectQuantity,
    qualityDecisionCount: productionAlerts.length,
    qualityReworkCount,
    qualityScrapDecisionCount,
    qualityConditionalAcceptCount
  };
  const operationDowntimeByShift = Object.values(downtimeByShiftMap).sort((first, second) => second.totalCount - first.totalCount);
  const operationDowntimeByMachine = Object.values(downtimeByMachineMap).sort((first, second) => second.totalCount - first.totalCount);
  const productionTrend = groupDailyProduction(finalProductLogs);
  const managementInsights = buildManagementInsights({
    summary,
    shiftPerformance,
    delayedOperations,
    operationDowntimeByMachine,
    operationDowntimeByShift,
    qualityDecisionByMachine
  });

  return {
    dateRange: {
      from: toDateInputValue(range.from),
      to: toDateInputValue(range.to)
    },
    summary,
    productionTrend,
    managementInsights,
    workOrderStatusCounts: countBy(workOrders, "status"),
    machineStatusCounts: countBy(machines, "status"),
    machineDowntimeReasonCounts: countBy(machineStatusLogs, "reason"),
    operationDowntimeReasonCounts: countByReason(operationDowntimes),
    operationDowntimeByShift,
    operationDowntimeByMachine,
    operationDowntimeByOperation: Object.values(downtimeByOperationMap).sort((first, second) => second.totalCount - first.totalCount),
    recentOperationDowntimes: operationDowntimes.slice(0, 10),
    operationTimePerformance,
    delayedOperations: delayedOperations.slice(0, 10),
    operationTimeByMachine,
    operationTimeByOperator,
    qualityStatusCounts: countBy(qualityChecks, "status"),
    qualityDecisionCounts,
    qualityDecisionByOperation,
    qualityDecisionByMachine,
    recentQualityDecisions,
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
