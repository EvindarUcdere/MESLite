import { prisma } from "../../config/db.js";
import { getReportSqlAnalytics } from "./reportSql.service.js";

function scrapRate(producedQuantity, scrapQuantity) {
  const totalProcessedQuantity = producedQuantity + scrapQuantity;
  return totalProcessedQuantity > 0 ? Number(((scrapQuantity / totalProcessedQuantity) * 100).toFixed(2)) : 0;
}

function formatDuration(minutes) {
  if (minutes > 48 * 60) {
    return `${Number((minutes / (24 * 60)).toFixed(1))} gün`;
  }

  if (minutes >= 60) {
    return `${Number((minutes / 60).toFixed(1))} saat`;
  }

  return `${Math.round(minutes)} dk`;
}

function percent(numerator, denominator) {
  if (denominator <= 0) {
    return 0;
  }

  return Number(((numerator / denominator) * 100).toFixed(2));
}

function clampRate(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(value, 1));
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

const WORK_ORDER_STATUSES = new Set(["PLANNED", "IN_PROGRESS", "PAUSED", "COMPLETED", "CANCELLED"]);

function normalizeFilterValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getReportFilters(query = {}) {
  const status = normalizeFilterValue(query.status);

  return {
    productId: normalizeFilterValue(query.productId),
    machineId: normalizeFilterValue(query.machineId),
    shiftId: normalizeFilterValue(query.shiftId),
    operatorId: normalizeFilterValue(query.operatorId),
    routeId: normalizeFilterValue(query.routeId),
    status: WORK_ORDER_STATUSES.has(status) ? status : undefined,
    includeTestData: query.includeTestData === true || query.includeTestData === "true"
  };
}

function compactAnd(...conditions) {
  return conditions.filter(Boolean);
}

function hasWorkOrderScope(filters) {
  return Boolean(filters.productId || filters.routeId || filters.status);
}

function buildWorkOrderScope(filters) {
  const scope = filters.includeTestData ? {} : { isTestData: false };

  if (filters.productId) {
    scope.productId = filters.productId;
  }

  if (filters.routeId) {
    scope.routeId = filters.routeId;
  }

  if (filters.status) {
    scope.status = filters.status;
  }

  return scope;
}

function buildRelatedWorkOrderFilter(filters) {
  return { workOrder: buildWorkOrderScope(filters) };
}

function buildWorkOrderWhere(range, filters) {
  const assignmentFilters = [];

  if (filters.machineId) {
    assignmentFilters.push(
      { machineId: filters.machineId },
      { operations: { some: { machineId: filters.machineId } } },
      { productionLogs: { some: { machineId: filters.machineId } } },
      { operationDowntimes: { some: { machineId: filters.machineId } } }
    );
  }

  if (filters.operatorId) {
    assignmentFilters.push(
      { assignedOperatorId: filters.operatorId },
      { operations: { some: { assignedOperatorId: filters.operatorId } } },
      { productionLogs: { some: { operatorId: filters.operatorId } } },
      { operationDowntimes: { some: { operatorId: filters.operatorId } } }
    );
  }

  if (filters.shiftId) {
    assignmentFilters.push(
      { productionLogs: { some: { shiftId: filters.shiftId } } },
      { operationDowntimes: { some: { shiftId: filters.shiftId } } }
    );
  }

  return {
    AND: compactAnd(
      {
        OR: [
          dateRangeFilter("plannedStartDate", range),
          dateRangeFilter("actualStartDate", range),
          dateRangeFilter("actualEndDate", range),
          dateRangeFilter("updatedAt", range)
        ]
      },
      buildWorkOrderScope(filters),
      assignmentFilters.length ? { OR: assignmentFilters } : null
    )
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

function dateKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function shiftDurationMinutes(shift) {
  if (!shift?.startTime || !shift?.endTime) {
    return 0;
  }

  const [startHour, startMinute] = shift.startTime.split(":").map(Number);
  const [endHour, endMinute] = shift.endTime.split(":").map(Number);
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;
  const duration = end > start ? end - start : 24 * 60 - start + end;

  return duration > 0 ? duration : 0;
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

function createOeeGroup(base) {
  return {
    ...base,
    operationCount: 0,
    plannedMinutes: 0,
    actualMinutes: 0,
    downtimeMinutes: 0,
    runMinutes: 0,
    idealRunMinutes: 0,
    producedQuantity: 0,
    scrapQuantity: 0,
    totalProcessedQuantity: 0
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

function addOeeMetrics(group, metrics) {
  group.operationCount += 1;
  group.plannedMinutes += metrics.plannedMinutes;
  group.actualMinutes += metrics.actualMinutes;
  group.downtimeMinutes += metrics.downtimeMinutes;
  group.runMinutes += metrics.runMinutes;
  group.idealRunMinutes += metrics.idealRunMinutes;
  group.producedQuantity += metrics.producedQuantity;
  group.scrapQuantity += metrics.scrapQuantity;
  group.totalProcessedQuantity += metrics.totalProcessedQuantity;
}

function finalizeOeeGroup(group) {
  const availabilityRate = clampRate(group.runMinutes / group.plannedMinutes);
  const performanceRate = clampRate(group.idealRunMinutes / group.runMinutes);
  const qualityRate = clampRate(group.producedQuantity / group.totalProcessedQuantity);
  const oeeRate = availabilityRate * performanceRate * qualityRate;

  return {
    ...group,
    availability: Number((availabilityRate * 100).toFixed(2)),
    performance: Number((performanceRate * 100).toFixed(2)),
    quality: Number((qualityRate * 100).toFixed(2)),
    oee: Number((oeeRate * 100).toFixed(2))
  };
}

function createCapacityOeeGroup(base) {
  return {
    ...base,
    activeShiftCount: 0,
    plannedCapacityMinutes: 0,
    downtimeMinutes: 0,
    productiveMinutes: 0,
    idealRunMinutes: 0,
    producedQuantity: 0,
    scrapQuantity: 0,
    totalProcessedQuantity: 0,
    logCount: 0,
    downtimeCount: 0
  };
}

function finalizeCapacityOeeGroup(group) {
  const availabilityMinutes = Math.max(group.plannedCapacityMinutes - group.downtimeMinutes, 0);
  const availabilityRate = clampRate(availabilityMinutes / group.plannedCapacityMinutes);
  const performanceRate = clampRate(group.idealRunMinutes / group.productiveMinutes);
  const qualityRate = clampRate(group.producedQuantity / group.totalProcessedQuantity);
  const oeeRate = availabilityRate * performanceRate * qualityRate;

  return {
    ...group,
    availabilityMinutes: Number(availabilityMinutes.toFixed(1)),
    availability: Number((availabilityRate * 100).toFixed(2)),
    performance: Number((performanceRate * 100).toFixed(2)),
    quality: Number((qualityRate * 100).toFixed(2)),
    oee: Number((oeeRate * 100).toFixed(2))
  };
}

function buildCapacityOee({ productionLogs, operationDowntimes }) {
  const summary = createCapacityOeeGroup({ scope: "CAPACITY", label: "Makine/Vardiya Kapasite OEE" });
  const machineMap = new Map();
  const capacitySlots = new Map();

  function ensureMachine(machine) {
    const machineId = machine?.id ?? "UNASSIGNED";

    if (!machineMap.has(machineId)) {
      machineMap.set(
        machineId,
        createCapacityOeeGroup({
          machineId,
          machineCode: machine?.code ?? "Makine Yok",
          machineName: machine?.name ?? "Makine Yok"
        })
      );
    }

    return machineMap.get(machineId);
  }

  function addCapacitySlot({ machine, shift, date }) {
    if (!machine?.id || !shift?.id || !date) {
      return;
    }

    const key = `${machine.id}:${shift.id}:${dateKey(date)}`;

    if (capacitySlots.has(key)) {
      return;
    }

    const duration = shiftDurationMinutes(shift);

    if (duration <= 0) {
      return;
    }

    capacitySlots.set(key, true);
    const machineGroup = ensureMachine(machine);

    for (const group of [summary, machineGroup]) {
      group.activeShiftCount += 1;
      group.plannedCapacityMinutes += duration;
    }
  }

  for (const log of productionLogs) {
    const totalProcessedQuantity = log.producedQuantity + log.scrapQuantity;
    const productiveMinutes = minutesBetween(log.startedAt, log.endedAt);
    const plannedQuantity = log.workOrder?.plannedQuantity ?? 0;
    const operationTargetMinutes = log.workOrderOperation?.routeOperation?.estimatedMinutes ?? 0;
    const idealRunMinutes =
      operationTargetMinutes > 0 && plannedQuantity > 0
        ? Math.min(operationTargetMinutes * (totalProcessedQuantity / plannedQuantity), operationTargetMinutes)
        : 0;
    const machineGroup = ensureMachine(log.machine);

    addCapacitySlot({ machine: log.machine, shift: log.shift, date: log.startedAt ?? log.createdAt });

    for (const group of [summary, machineGroup]) {
      group.productiveMinutes += productiveMinutes;
      group.idealRunMinutes += idealRunMinutes;
      group.producedQuantity += log.producedQuantity;
      group.scrapQuantity += log.scrapQuantity;
      group.totalProcessedQuantity += totalProcessedQuantity;
      group.logCount += 1;
    }
  }

  for (const downtime of operationDowntimes) {
    const machineGroup = ensureMachine(downtime.machine);
    const duration = minutesBetween(downtime.startedAt, downtime.endedAt ?? new Date());

    addCapacitySlot({ machine: downtime.machine, shift: downtime.shift, date: downtime.startedAt });

    for (const group of [summary, machineGroup]) {
      group.downtimeMinutes += duration;
      group.downtimeCount += 1;
    }
  }

  return {
    summary: finalizeCapacityOeeGroup(summary),
    byMachine: [...machineMap.values()]
      .filter((group) => group.activeShiftCount > 0 || group.logCount > 0 || group.downtimeCount > 0)
      .map(finalizeCapacityOeeGroup)
      .sort((first, second) => first.oee - second.oee)
  };
}

function buildOperatorPerformance(operationTimePerformance) {
  const map = new Map();

  for (const operation of operationTimePerformance) {
    if (!operation.operatorId) {
      continue;
    }

    const current = map.get(operation.operatorId) ?? {
      operatorId: operation.operatorId,
      operatorName: operation.operatorName,
      operationCount: 0,
      completedOperationCount: 0,
      plannedMinutes: 0,
      idealRunMinutes: 0,
      completedPlannedMinutes: 0,
      completedNetMinutes: 0,
      producedQuantity: 0,
      scrapQuantity: 0,
      totalProcessedQuantity: 0
    };

    current.operationCount += 1;
    current.completedOperationCount += operation.completedAt ? 1 : 0;
    current.plannedMinutes += operation.plannedMinutes;
    current.idealRunMinutes += operation.idealRunMinutes;
    current.producedQuantity += operation.producedQuantity;
    current.scrapQuantity += operation.scrapQuantity;
    current.totalProcessedQuantity += operation.totalProcessedQuantity;

    if (operation.completedAt) {
      current.completedPlannedMinutes += operation.plannedMinutes;
      current.completedNetMinutes += operation.netMinutes;
    }

    map.set(operation.operatorId, current);
  }

  return [...map.values()]
    .map((item) => {
      const targetAchievement = percent(Math.min(item.idealRunMinutes, item.plannedMinutes), item.plannedMinutes);
      const timeEfficiency = item.completedNetMinutes > 0
        ? percent(Math.min(item.completedPlannedMinutes, item.completedNetMinutes), item.completedNetMinutes)
        : null;
      const qualityRate = percent(item.producedQuantity, item.totalProcessedQuantity);
      const completionRate = percent(item.completedOperationCount, item.operationCount);
      const components = [
        { value: targetAchievement, weight: 35 },
        ...(timeEfficiency === null ? [] : [{ value: timeEfficiency, weight: 25 }]),
        { value: qualityRate, weight: 30 },
        { value: completionRate, weight: 10 }
      ];
      const totalWeight = components.reduce((sum, component) => sum + component.weight, 0);
      const performanceScore = totalWeight > 0
        ? Number((components.reduce((sum, component) => sum + component.value * component.weight, 0) / totalWeight).toFixed(2))
        : 0;

      return {
        ...item,
        targetAchievement,
        timeEfficiency,
        qualityRate,
        completionRate,
        performanceScore,
        dataConfidence: item.operationCount >= 5 ? "HIGH" : item.operationCount >= 2 ? "MEDIUM" : "LOW"
      };
    })
    .sort((first, second) => first.performanceScore - second.performanceScore);
}

function buildMachineLossAnalysis(oeeByMachine, operationTimeByMachine, operationDowntimeByMachine, qualityDecisionByMachine) {
  const timeMap = new Map(operationTimeByMachine.map((item) => [item.machineId, item]));
  const downtimeMap = new Map(operationDowntimeByMachine.map((item) => [item.machineId, item]));
  const qualityMap = new Map(qualityDecisionByMachine.map((item) => [item.machineId, item]));
  const definitions = {
    AVAILABILITY: {
      label: "Kullanılabilirlik / duruş",
      action: "En sık duruş nedenini bakım, malzeme ve planlama ekipleriyle kapatın."
    },
    PERFORMANCE: {
      label: "Hız / proses performansı",
      action: "Çevrim süresi, ayar süresi ve standart operasyon süresini sahada doğrulayın."
    },
    QUALITY: {
      label: "Kalite kaybı",
      action: "Fire nedenlerini, proses parametrelerini ve kalite kararlarını birlikte inceleyin."
    }
  };

  return oeeByMachine
    .filter((machine) => machine.machineId && machine.machineId !== "UNASSIGNED")
    .map((machine) => {
      const components = [
        { type: "AVAILABILITY", value: machine.availability },
        { type: "PERFORMANCE", value: machine.performance },
        { type: "QUALITY", value: machine.quality }
      ].sort((first, second) => first.value - second.value);
      const primary = components[0];
      const definition = definitions[primary.type];
      const time = timeMap.get(machine.machineId);
      const downtime = downtimeMap.get(machine.machineId);
      const quality = qualityMap.get(machine.machineId);
      const topDowntimeReason = downtime
        ? Object.entries(downtime.reasonCounts ?? {}).sort((first, second) => second[1] - first[1])[0]?.[0] ?? null
        : null;

      return {
        machineId: machine.machineId,
        machineCode: machine.machineCode,
        machineName: machine.machineName,
        operationCount: machine.operationCount,
        oee: machine.oee,
        availability: machine.availability,
        performance: machine.performance,
        quality: machine.quality,
        primaryLoss: primary.type,
        primaryLossLabel: definition.label,
        lossPercent: Number((100 - primary.value).toFixed(2)),
        recommendedAction: definition.action,
        downtimeCount: downtime?.totalCount ?? 0,
        downtimeMinutes: Number((time?.downtimeMinutes ?? machine.downtimeMinutes ?? 0).toFixed(1)),
        topDowntimeReason,
        delayMinutes: Number((time?.delayMinutes ?? 0).toFixed(1)),
        scrapQuantity: machine.scrapQuantity,
        qualityDecisionCount: quality?.totalCount ?? 0,
        severity: machine.oee < 40 ? "CRITICAL" : machine.oee < 65 ? "WARNING" : "INFO",
        dataConfidence: machine.operationCount >= 5 ? "HIGH" : machine.operationCount >= 2 ? "MEDIUM" : "LOW"
      };
    })
    .sort((first, second) => {
      const severityOrder = { CRITICAL: 0, WARNING: 1, INFO: 2 };
      return severityOrder[first.severity] - severityOrder[second.severity] || first.oee - second.oee;
    });
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

function monthKey(date) {
  return date.toISOString().slice(0, 7);
}

function monthLabel(key) {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("tr-TR", { month: "short", year: "numeric" }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function isDateWithinRange(date, range) {
  return Boolean(date && date >= range.from && date <= range.to);
}

function getWorkOrderReportDate(workOrder, range) {
  return [workOrder.plannedStartDate, workOrder.actualStartDate, workOrder.actualEndDate].find((date) => isDateWithinRange(date, range)) ?? null;
}

function buildPlanActualPerformance(workOrders, range) {
  const map = {};
  const cursor = new Date(Date.UTC(range.from.getUTCFullYear(), range.from.getUTCMonth(), 1));
  const lastMonth = new Date(Date.UTC(range.to.getUTCFullYear(), range.to.getUTCMonth(), 1));

  while (cursor <= lastMonth) {
    const key = monthKey(cursor);

    map[key] = {
      period: key,
      label: monthLabel(key),
      workOrderCount: 0,
      completedWorkOrderCount: 0,
      plannedQuantity: 0,
      producedQuantity: 0,
      scrapQuantity: 0
    };

    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  workOrders.forEach((workOrder) => {
    const date = getWorkOrderReportDate(workOrder, range);

    if (!date) {
      return;
    }

    const key = monthKey(date);

    if (!map[key]) {
      map[key] = {
        period: key,
        label: monthLabel(key),
        workOrderCount: 0,
        completedWorkOrderCount: 0,
        plannedQuantity: 0,
        producedQuantity: 0,
        scrapQuantity: 0
      };
    }

    map[key].workOrderCount += 1;
    map[key].completedWorkOrderCount += workOrder.status === "COMPLETED" ? 1 : 0;
    map[key].plannedQuantity += workOrder.plannedQuantity;
    map[key].producedQuantity += workOrder.producedQuantity;
    map[key].scrapQuantity += workOrder.scrapQuantity;
  });

  return Object.values(map)
    .map((item) => ({
      ...item,
      gapQuantity: Math.max(item.plannedQuantity - item.producedQuantity, 0),
      completionRate: item.plannedQuantity > 0 ? Number(((item.producedQuantity / item.plannedQuantity) * 100).toFixed(2)) : 0,
      scrapRate: scrapRate(item.producedQuantity, item.scrapQuantity)
    }))
    .sort((first, second) => first.period.localeCompare(second.period));
}

function buildManagementInsights({ summary, shiftPerformance, delayedOperations, staleOperations, operationDowntimeByMachine, operationDowntimeByShift, qualityDecisionByMachine }) {
  const insights = [];

  const stalestOperation = staleOperations[0];
  if (stalestOperation) {
    insights.push({
      type: "STALE_OPERATION",
      severity: "CRITICAL",
      title: "Uzun süredir açık operasyon",
      message: `${stalestOperation.orderNo} / ${stalestOperation.operationName} operasyonu ${formatDuration(stalestOperation.actualMinutes)} süredir kapanmamış görünüyor.`,
      workOrderId: stalestOperation.workOrderId,
      operationId: stalestOperation.operationId
    });
  }

  if (summary.planCompletionRate < 85 && summary.plannedQuantity > 0) {
    insights.push({
      type: "PLAN_GAP",
      severity: "WARNING",
      title: "Plan gerçekleşmesi düşük",
      message: `Seçili dönemde plan gerçekleşmesi %${summary.planCompletionRate}. ${summary.productionGapQuantity} adet açık üretim var.`
    });
  }

  if (summary.oee > 0 && summary.oee < 60) {
    insights.push({
      type: "OEE_LOW",
      severity: "WARNING",
      title: "OEE düşük",
      message: `Seçili dönemde toplam OEE %${summary.oee}. Kullanılabilirlik, performans ve kalite bileşenleri birlikte incelenmeli.`
    });
  }

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
      message: `${mostDelayedOperation.orderNo} / ${mostDelayedOperation.operationName} operasyonunda ${formatDuration(mostDelayedOperation.delayMinutes)} gecikme var.`
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
  const filters = getReportFilters(query);
  const workOrderScope = buildRelatedWorkOrderFilter(filters);
  const [
    workOrders,
    productionLogs,
    qualityChecks,
    productionAlerts,
    machines,
    machineStatusLogs,
    operationDowntimes,
    workOrderOperations,
    sqlAnalytics
  ] = await Promise.all([
    prisma.workOrder.findMany({
      where: buildWorkOrderWhere(range, filters),
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
      where: {
        AND: compactAnd(
          dateRangeFilter("createdAt", range),
          workOrderScope,
          filters.machineId ? { machineId: filters.machineId } : null,
          filters.shiftId ? { shiftId: filters.shiftId } : null,
          filters.operatorId ? { operatorId: filters.operatorId } : null
        )
      },
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
        workOrderOperation: {
          include: {
            routeOperation: true
          }
        },
        operator: {
          select: { id: true, name: true, email: true, role: true }
        }
      },
      orderBy: { createdAt: "desc" }
    }),
    prisma.qualityCheck.findMany({
      where: {
        AND: compactAnd(
          dateRangeFilter("checkedAt", range),
          workOrderScope,
          filters.machineId ? { workOrderOperation: { machineId: filters.machineId } } : null,
          filters.shiftId ? { workOrder: { productionLogs: { some: { shiftId: filters.shiftId } } } } : null,
          filters.operatorId
            ? {
                OR: [{ checkedById: filters.operatorId }, { workOrderOperation: { assignedOperatorId: filters.operatorId } }]
              }
            : null
        )
      },
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
        AND: compactAnd(
          dateRangeFilter("updatedAt", range),
          { qualityDecision: { not: null } },
          workOrderScope,
          filters.machineId
            ? {
                OR: [{ productionLog: { machineId: filters.machineId } }, { reworkOperation: { machineId: filters.machineId } }]
              }
            : null,
          filters.shiftId ? { productionLog: { shiftId: filters.shiftId } } : null,
          filters.operatorId
            ? {
                OR: [
                  { productionLog: { operatorId: filters.operatorId } },
                  { reworkOperation: { assignedOperatorId: filters.operatorId } },
                  { createdById: filters.operatorId },
                  { resolvedById: filters.operatorId }
                ]
              }
            : null
        )
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
    prisma.machine.findMany({
      where: filters.machineId ? { id: filters.machineId } : undefined,
      include: { productionLine: true }
    }),
    prisma.machineStatusLog.findMany({
      where: {
        AND: compactAnd(
          { status: { in: ["STOPPED", "MAINTENANCE"] } },
          dateRangeFilter("createdAt", range),
          filters.machineId ? { machineId: filters.machineId } : null
        )
      },
      orderBy: { createdAt: "desc" },
      take: 100
    }),
    prisma.operationDowntime.findMany({
      where: {
        AND: compactAnd(
          dateRangeFilter("startedAt", range),
          workOrderScope,
          filters.machineId ? { machineId: filters.machineId } : null,
          filters.shiftId ? { shiftId: filters.shiftId } : null,
          filters.operatorId
            ? {
                OR: [{ operatorId: filters.operatorId }, { workOrderOperation: { assignedOperatorId: filters.operatorId } }]
              }
            : null
        )
      },
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
        AND: compactAnd(
          {
            startedAt: {
              not: null,
              gte: range.from,
              lte: range.to
            }
          },
          workOrderScope,
          filters.machineId ? { machineId: filters.machineId } : null,
          filters.operatorId ? { assignedOperatorId: filters.operatorId } : null,
          filters.shiftId ? { productionLogs: { some: { shiftId: filters.shiftId } } } : null
        )
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
    }),
    getReportSqlAnalytics({ range, filters })
  ]);

  const finalProductLogs = productionLogs.filter(isFinalProductLog);
  const processTotals = sqlAnalytics.processTotals ?? sumProductionLogs(productionLogs);
  const finalProductTotals = sqlAnalytics.finalProductTotals ?? sumProductionLogs(finalProductLogs);
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
  const oeeOverallGroup = createOeeGroup({ scope: "OVERALL", label: "Genel" });
  const oeeByMachineMap = {};
  const oeeByOperationMap = {};
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

  const prismaOperationTimePerformance = workOrderOperations.map((operation) => {
    const plannedMinutes = operation.routeOperation?.estimatedMinutes ?? 0;
    const actualMinutes = minutesBetween(operation.startedAt, operation.completedAt ?? now);
    const downtimeMinutes = sumDowntimeMinutes(operation.downtimes ?? [], operation.completedAt ?? now);
    const netMinutes = Math.max(actualMinutes - downtimeMinutes, 0);
    const delayMinutes = plannedMinutes > 0 ? Math.max(netMinutes - plannedMinutes, 0) : 0;
    const totalProcessedQuantity = operation.producedQuantity + operation.scrapQuantity;
    const plannedQuantity = operation.workOrder.plannedQuantity;
    const idealRunMinutes =
      plannedMinutes > 0 && plannedQuantity > 0 ? Math.min(plannedMinutes * (totalProcessedQuantity / plannedQuantity), plannedMinutes) : 0;

    const item = {
      operationId: operation.id,
      workOrderId: operation.workOrderId,
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
      producedQuantity: operation.producedQuantity,
      scrapQuantity: operation.scrapQuantity,
      totalProcessedQuantity,
      idealRunMinutes,
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

    addOeeMetrics(oeeOverallGroup, {
      plannedMinutes,
      actualMinutes,
      downtimeMinutes,
      runMinutes: netMinutes,
      idealRunMinutes,
      producedQuantity: operation.producedQuantity,
      scrapQuantity: operation.scrapQuantity,
      totalProcessedQuantity
    });

    if (!oeeByMachineMap[machineKey]) {
      oeeByMachineMap[machineKey] = createOeeGroup({
        machineId: machineKey,
        machineCode: item.machineCode,
        machineName: item.machineName
      });
    }
    addOeeMetrics(oeeByMachineMap[machineKey], {
      plannedMinutes,
      actualMinutes,
      downtimeMinutes,
      runMinutes: netMinutes,
      idealRunMinutes,
      producedQuantity: operation.producedQuantity,
      scrapQuantity: operation.scrapQuantity,
      totalProcessedQuantity
    });

    const operationNameKey = `${operation.routeOperationId ?? operation.operationName}:${operation.operationName}`;
    if (!oeeByOperationMap[operationNameKey]) {
      oeeByOperationMap[operationNameKey] = createOeeGroup({
        operationKey: operationNameKey,
        operationName: operation.operationName
      });
    }
    addOeeMetrics(oeeByOperationMap[operationNameKey], {
      plannedMinutes,
      actualMinutes,
      downtimeMinutes,
      runMinutes: netMinutes,
      idealRunMinutes,
      producedQuantity: operation.producedQuantity,
      scrapQuantity: operation.scrapQuantity,
      totalProcessedQuantity
    });

    return item;
  });

  const prismaDelayedOperations = prismaOperationTimePerformance.filter((operation) => operation.delayMinutes > 0).sort((first, second) => second.delayMinutes - first.delayMinutes);
  const prismaOperationTimeByMachine = Object.values(timeByMachineMap).map(finalizeTimeGroup).sort((first, second) => second.delayMinutes - first.delayMinutes);
  const prismaOperationTimeByOperator = Object.values(timeByOperatorMap).map(finalizeTimeGroup).sort((first, second) => second.delayMinutes - first.delayMinutes);
  const prismaOeeSummary = finalizeOeeGroup(oeeOverallGroup);
  const prismaOeeByMachine = Object.values(oeeByMachineMap).map(finalizeOeeGroup).sort((first, second) => second.oee - first.oee);
  const prismaOeeByOperation = Object.values(oeeByOperationMap).map(finalizeOeeGroup).sort((first, second) => second.oee - first.oee);

  const operationTimePerformance = sqlAnalytics.operationTimePerformance.length ? sqlAnalytics.operationTimePerformance : prismaOperationTimePerformance;
  const delayedOperations = sqlAnalytics.delayedOperations.length ? sqlAnalytics.delayedOperations : prismaDelayedOperations;
  const staleOperations = operationTimePerformance
    .filter(
      (operation) =>
        !operation.completedAt &&
        operation.actualMinutes >= Math.max(8 * 60, operation.plannedMinutes * 2)
    )
    .sort((first, second) => second.actualMinutes - first.actualMinutes);
  const operationTimeByMachine = sqlAnalytics.operationTimeByMachine.length ? sqlAnalytics.operationTimeByMachine : prismaOperationTimeByMachine;
  const operationTimeByOperator = sqlAnalytics.operationTimeByOperator.length ? sqlAnalytics.operationTimeByOperator : prismaOperationTimeByOperator;
  const operatorPerformance = buildOperatorPerformance(operationTimePerformance);
  const oeeSummary = sqlAnalytics.oeeSummary.operationCount > 0 ? sqlAnalytics.oeeSummary : prismaOeeSummary;
  const oeeByMachine = sqlAnalytics.oeeByMachine.length ? sqlAnalytics.oeeByMachine : prismaOeeByMachine;
  const oeeByOperation = sqlAnalytics.oeeByOperation.length ? sqlAnalytics.oeeByOperation : prismaOeeByOperation;

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

  const machinePerformance = sqlAnalytics.machinePerformance.length
    ? sqlAnalytics.machinePerformance
    : Object.values(machinePerformanceMap).map((item) => ({
        ...item,
        scrapRate: scrapRate(item.producedQuantity, item.scrapQuantity)
      }));

  const productPerformance = Object.values(productPerformanceMap).map((item) => ({
    ...item,
    scrapRate: scrapRate(item.producedQuantity, item.scrapQuantity)
  }));

  const shiftPerformance = sqlAnalytics.shiftPerformance.length
    ? sqlAnalytics.shiftPerformance
    : sortByProducedThenScrap(
        Object.values(shiftPerformanceMap).map((item) => ({
          ...item,
          operatorCount: item.operatorIds.size,
          machineCount: item.machineIds.size,
          scrapRate: scrapRate(item.producedQuantity, item.scrapQuantity),
          operatorIds: undefined,
          machineIds: undefined
        }))
      );

  const operatorShiftPerformance = sqlAnalytics.operatorShiftPerformance.length
    ? sqlAnalytics.operatorShiftPerformance
    : sortByProducedThenScrap(
        Object.values(operatorShiftPerformanceMap).map((item) => ({
          ...item,
          scrapRate: scrapRate(item.producedQuantity, item.scrapQuantity)
        }))
      );

  const machineShiftPerformance = sqlAnalytics.machineShiftPerformance.length
    ? sqlAnalytics.machineShiftPerformance
    : sortByProducedThenScrap(
        Object.values(machineShiftPerformanceMap).map((item) => ({
          ...item,
          scrapRate: scrapRate(item.producedQuantity, item.scrapQuantity)
        }))
      );

  const planActualPerformance = sqlAnalytics.planActualPerformance.length ? sqlAnalytics.planActualPerformance : buildPlanActualPerformance(workOrders, range);
  const plannedQuantity = planActualPerformance.reduce((sum, item) => sum + item.plannedQuantity, 0);
  const productionGapQuantity = Math.max(plannedQuantity - producedQuantity, 0);
  const planCompletionRate = plannedQuantity > 0 ? Number(((producedQuantity / plannedQuantity) * 100).toFixed(2)) : 0;

  const summary = {
    workOrderCount: workOrders.length,
    productionLogCount: productionLogs.length,
    machineCount: machines.length,
    plannedQuantity,
    producedQuantity,
    processProducedQuantity,
    productionGapQuantity,
    planCompletionRate,
    availability: oeeSummary.availability,
    performance: oeeSummary.performance,
    quality: oeeSummary.quality,
    oee: oeeSummary.oee,
    scrapQuantity,
    finalScrapQuantity,
    scrapRate: scrapRate(processProducedQuantity, scrapQuantity),
    qualityCheckCount: qualityChecks.length,
    defectQuantity,
    qualityDecisionCount: productionAlerts.length,
    qualityReworkCount,
    qualityScrapDecisionCount,
    qualityConditionalAcceptCount
  };
  const operationDowntimeReasonCounts = Object.keys(sqlAnalytics.operationDowntimeReasonCounts).length
    ? sqlAnalytics.operationDowntimeReasonCounts
    : countByReason(operationDowntimes);
  const operationDowntimeByShift = sqlAnalytics.operationDowntimeByShift.length
    ? sqlAnalytics.operationDowntimeByShift
    : Object.values(downtimeByShiftMap).sort((first, second) => second.totalCount - first.totalCount);
  const operationDowntimeByMachine = sqlAnalytics.operationDowntimeByMachine.length
    ? sqlAnalytics.operationDowntimeByMachine
    : Object.values(downtimeByMachineMap).sort((first, second) => second.totalCount - first.totalCount);
  const operationDowntimeByOperation = sqlAnalytics.operationDowntimeByOperation.length
    ? sqlAnalytics.operationDowntimeByOperation
    : Object.values(downtimeByOperationMap).sort((first, second) => second.totalCount - first.totalCount);
  const machineLossAnalysis = buildMachineLossAnalysis(
    oeeByMachine,
    operationTimeByMachine,
    operationDowntimeByMachine,
    qualityDecisionByMachine
  );
  const capacityOee = buildCapacityOee({ productionLogs, operationDowntimes });
  const productionTrend = sqlAnalytics.productionTrend.length ? sqlAnalytics.productionTrend : groupDailyProduction(finalProductLogs);
  const managementInsights = buildManagementInsights({
    summary,
    shiftPerformance,
    delayedOperations,
    staleOperations,
    operationDowntimeByMachine,
    operationDowntimeByShift,
    qualityDecisionByMachine
  });

  const orphanOpenDowntimes = operationDowntimes.filter(
    (downtime) => !downtime.endedAt && downtime.workOrderOperation?.status !== "PAUSED"
  );
  const validDowntimes = operationDowntimes.filter(
    (downtime) => Boolean(downtime.endedAt) || downtime.workOrderOperation?.status === "PAUSED"
  );
  const dataQuality = {
    operationTargetCoverage: percent(workOrderOperations.filter((operation) => Number(operation.routeOperation?.estimatedMinutes ?? 0) > 0).length, workOrderOperations.length),
    completedOperationCoverage: percent(workOrderOperations.filter((operation) => Boolean(operation.completedAt)).length, workOrderOperations.length),
    shiftAssignmentCoverage: percent(productionLogs.filter((log) => Boolean(log.shiftId)).length, productionLogs.length),
    closedDowntimeCoverage: percent(validDowntimes.length, operationDowntimes.length),
    workOrderPlanDateCoverage: percent(workOrders.filter((workOrder) => Boolean(workOrder.plannedStartDate && workOrder.plannedEndDate)).length, workOrders.length)
  };
  const dataQualityValues = Object.values(dataQuality);
  const dataQualityScore = dataQualityValues.length ? Number((dataQualityValues.reduce((sum, value) => sum + value, 0) / dataQualityValues.length).toFixed(2)) : 0;
  const dataQualityWarnings = [
    dataQuality.operationTargetCoverage < 80 ? "Operasyon hedef sürelerinin bir bölümü eksik." : null,
    dataQuality.completedOperationCoverage < 80 ? "Açık operasyonlar dönem süre analizini etkiliyor." : null,
    dataQuality.shiftAssignmentCoverage < 80 ? "Bazı üretim kayıtlarında vardiya bilgisi yok." : null,
    orphanOpenDowntimes.length > 0 ? `${orphanOpenDowntimes.length} açık duruş kaydı duraklatılmış bir operasyonla eşleşmiyor.` : null,
    dataQuality.workOrderPlanDateCoverage < 80 ? "Bazı iş emirlerinde plan başlangıç/bitiş tarihi eksik." : null
  ].filter(Boolean);

  return {
    dateRange: {
      from: toDateInputValue(range.from),
      to: toDateInputValue(range.to)
    },
    filters,
    summary,
    productionTrend,
    planActualPerformance,
    managementInsights,
    dataQuality: {
      ...dataQuality,
      orphanOpenDowntimeCount: orphanOpenDowntimes.length,
      score: dataQualityScore,
      level: dataQualityScore >= 85 ? "HIGH" : dataQualityScore >= 65 ? "MEDIUM" : "LOW",
      warnings: dataQualityWarnings
    },
    workOrderStatusCounts: countBy(workOrders, "status"),
    machineStatusCounts: countBy(machines, "status"),
    machineDowntimeReasonCounts: countBy(machineStatusLogs, "reason"),
    operationDowntimeReasonCounts,
    operationDowntimeByShift,
    operationDowntimeByMachine,
    operationDowntimeByOperation,
    recentOperationDowntimes: operationDowntimes.slice(0, 10),
    operationTimePerformance,
    delayedOperations: delayedOperations.slice(0, 10),
    staleOperations: staleOperations.slice(0, 10),
    operationTimeByMachine,
    operationTimeByOperator,
    operatorPerformance,
    oeeSummary,
    oeeByMachine,
    oeeByOperation,
    capacityOeeSummary: capacityOee.summary,
    capacityOeeByMachine: capacityOee.byMachine,
    machineLossAnalysis,
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
