import { Prisma } from "@prisma/client";
import { prisma } from "../../config/db.js";

function toNumber(value) {
  return Number(value ?? 0);
}

function percent(numerator, denominator) {
  const num = toNumber(numerator);
  const den = toNumber(denominator);
  return den > 0 ? Number(((num / den) * 100).toFixed(2)) : 0;
}

function scrapRate(producedQuantity, scrapQuantity) {
  return percent(scrapQuantity, toNumber(producedQuantity) + toNumber(scrapQuantity));
}

function monthLabel(period) {
  const [year, month] = period.split("-").map(Number);
  return new Intl.DateTimeFormat("tr-TR", { month: "short", year: "numeric" }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function buildProductionWhere(range, filters) {
  const conditions = [Prisma.sql`pl."createdAt" >= ${range.from}`, Prisma.sql`pl."createdAt" <= ${range.to}`];

  if (!filters.includeTestData) {
    conditions.push(Prisma.sql`wo."isTestData" = false`);
  }

  if (filters.productId) {
    conditions.push(Prisma.sql`wo."productId" = ${filters.productId}`);
  }

  if (filters.routeId) {
    conditions.push(Prisma.sql`wo."routeId" = ${filters.routeId}`);
  }

  if (filters.status) {
    conditions.push(Prisma.sql`wo."status"::text = ${filters.status}`);
  }

  if (filters.machineId) {
    conditions.push(Prisma.sql`pl."machineId" = ${filters.machineId}`);
  }

  if (filters.shiftId) {
    conditions.push(Prisma.sql`pl."shiftId" = ${filters.shiftId}`);
  }

  if (filters.operatorId) {
    conditions.push(Prisma.sql`pl."operatorId" = ${filters.operatorId}`);
  }

  return Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;
}

function buildWorkOrderWhere(range, filters) {
  const conditions = [
    Prisma.sql`COALESCE(wo."actualEndDate", wo."actualStartDate", wo."plannedStartDate", wo."updatedAt") >= ${range.from}`,
    Prisma.sql`COALESCE(wo."actualEndDate", wo."actualStartDate", wo."plannedStartDate", wo."updatedAt") <= ${range.to}`
  ];

  if (!filters.includeTestData) {
    conditions.push(Prisma.sql`wo."isTestData" = false`);
  }

  if (filters.productId) {
    conditions.push(Prisma.sql`wo."productId" = ${filters.productId}`);
  }

  if (filters.routeId) {
    conditions.push(Prisma.sql`wo."routeId" = ${filters.routeId}`);
  }

  if (filters.status) {
    conditions.push(Prisma.sql`wo."status"::text = ${filters.status}`);
  }

  return Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;
}

function buildOperationWhere(range, filters) {
  const conditions = [
    Prisma.sql`woo."startedAt" IS NOT NULL`,
    Prisma.sql`woo."startedAt" >= ${range.from}`,
    Prisma.sql`woo."startedAt" <= ${range.to}`
  ];

  if (!filters.includeTestData) {
    conditions.push(Prisma.sql`wo."isTestData" = false`);
  }

  if (filters.productId) {
    conditions.push(Prisma.sql`wo."productId" = ${filters.productId}`);
  }

  if (filters.routeId) {
    conditions.push(Prisma.sql`wo."routeId" = ${filters.routeId}`);
  }

  if (filters.status) {
    conditions.push(Prisma.sql`wo."status"::text = ${filters.status}`);
  }

  if (filters.machineId) {
    conditions.push(Prisma.sql`woo."machineId" = ${filters.machineId}`);
  }

  if (filters.operatorId) {
    conditions.push(Prisma.sql`woo."assignedOperatorId" = ${filters.operatorId}`);
  }

  if (filters.shiftId) {
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM "ProductionLog" pl_shift
      WHERE pl_shift."workOrderOperationId" = woo.id AND pl_shift."shiftId" = ${filters.shiftId}
    )`);
  }

  return Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;
}

function buildDowntimeWhere(range, filters) {
  const conditions = [Prisma.sql`od."startedAt" >= ${range.from}`, Prisma.sql`od."startedAt" <= ${range.to}`];

  if (!filters.includeTestData) {
    conditions.push(Prisma.sql`wo."isTestData" = false`);
  }

  if (filters.productId) {
    conditions.push(Prisma.sql`wo."productId" = ${filters.productId}`);
  }

  if (filters.routeId) {
    conditions.push(Prisma.sql`wo."routeId" = ${filters.routeId}`);
  }

  if (filters.status) {
    conditions.push(Prisma.sql`wo."status"::text = ${filters.status}`);
  }

  if (filters.machineId) {
    conditions.push(Prisma.sql`od."machineId" = ${filters.machineId}`);
  }

  if (filters.shiftId) {
    conditions.push(Prisma.sql`od."shiftId" = ${filters.shiftId}`);
  }

  if (filters.operatorId) {
    conditions.push(Prisma.sql`(od."operatorId" = ${filters.operatorId} OR woo."assignedOperatorId" = ${filters.operatorId})`);
  }

  return Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;
}

const finalOperationCondition = Prisma.sql`
  (
    pl."workOrderOperationId" IS NULL
    OR pl."workOrderOperationId" = (
      SELECT woo_last.id
      FROM "work_order_operations" woo_last
      WHERE woo_last."workOrderId" = pl."workOrderId"
      ORDER BY woo_last."sequenceNo" DESC
      LIMIT 1
    )
  )
`;

function mapProductionTotals(row) {
  return {
    producedQuantity: toNumber(row?.produced_quantity),
    scrapQuantity: toNumber(row?.scrap_quantity),
    logCount: toNumber(row?.log_count)
  };
}

function clampRate(value) {
  return Number.isFinite(value) ? Math.max(0, Math.min(value, 1)) : 0;
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

function addOeeRow(group, row) {
  group.operationCount += 1;
  group.plannedMinutes += toNumber(row.planned_minutes);
  group.actualMinutes += toNumber(row.actual_minutes);
  group.downtimeMinutes += toNumber(row.downtime_minutes);
  group.runMinutes += toNumber(row.net_minutes);
  group.idealRunMinutes += toNumber(row.ideal_run_minutes);
  group.producedQuantity += toNumber(row.produced_quantity);
  group.scrapQuantity += toNumber(row.scrap_quantity);
  group.totalProcessedQuantity += toNumber(row.total_processed_quantity);
}

function finalizeTimeGroup(group) {
  return {
    ...group,
    avgDelayMinutes: group.operationCount > 0 ? Number((group.delayMinutes / group.operationCount).toFixed(1)) : 0,
    avgNetMinutes: group.operationCount > 0 ? Number((group.netMinutes / group.operationCount).toFixed(1)) : 0
  };
}

function addTimeRow(map, key, base, row) {
  if (!map[key]) {
    map[key] = {
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

  map[key].operationCount += 1;
  map[key].completedOperationCount += row.completed_at ? 1 : 0;
  map[key].plannedMinutes += toNumber(row.planned_minutes);
  map[key].actualMinutes += toNumber(row.actual_minutes);
  map[key].downtimeMinutes += toNumber(row.downtime_minutes);
  map[key].netMinutes += toNumber(row.net_minutes);
  map[key].delayMinutes += toNumber(row.delay_minutes);
}

function groupDowntimeRows(rows, keyField, baseMapper) {
  const map = {};

  rows.forEach((row) => {
    const key = row[keyField] ?? "UNASSIGNED";
    if (!map[key]) {
      map[key] = {
        ...baseMapper(row),
        totalCount: 0,
        reasonCounts: {}
      };
    }

    map[key].totalCount += toNumber(row.total_count);
    map[key].reasonCounts[row.reason] = toNumber(row.total_count);
  });

  return Object.values(map).sort((first, second) => second.totalCount - first.totalCount);
}

export async function getReportSqlAnalytics({ range, filters }) {
  const productionWhere = buildProductionWhere(range, filters);
  const workOrderWhere = buildWorkOrderWhere(range, filters);
  const operationWhere = buildOperationWhere(range, filters);
  const downtimeWhere = buildDowntimeWhere(range, filters);

  const [
    processTotalsRows,
    finalTotalsRows,
    productionTrendRows,
    planActualRows,
    machinePerformanceRows,
    shiftPerformanceRows,
    operatorShiftRows,
    machineShiftRows,
    operationMetricRows,
    downtimeReasonRows,
    downtimeShiftRows,
    downtimeMachineRows,
    downtimeOperationRows
  ] = await Promise.all([
    prisma.$queryRaw`
      SELECT
        COALESCE(SUM(pl."producedQuantity"), 0)::int AS produced_quantity,
        COALESCE(SUM(pl."scrapQuantity"), 0)::int AS scrap_quantity,
        COUNT(*)::int AS log_count
      FROM "ProductionLog" pl
      JOIN "WorkOrder" wo ON wo.id = pl."workOrderId"
      ${productionWhere}
    `,
    prisma.$queryRaw`
      SELECT
        COALESCE(SUM(pl."producedQuantity"), 0)::int AS produced_quantity,
        COALESCE(SUM(pl."scrapQuantity"), 0)::int AS scrap_quantity,
        COUNT(*)::int AS log_count
      FROM "ProductionLog" pl
      JOIN "WorkOrder" wo ON wo.id = pl."workOrderId"
      ${productionWhere}
        AND ${finalOperationCondition}
    `,
    prisma.$queryRaw`
      SELECT
        TO_CHAR(pl."createdAt"::date, 'YYYY-MM-DD') AS date,
        COALESCE(SUM(pl."producedQuantity"), 0)::int AS produced_quantity,
        COALESCE(SUM(pl."scrapQuantity"), 0)::int AS scrap_quantity,
        COUNT(*)::int AS log_count
      FROM "ProductionLog" pl
      JOIN "WorkOrder" wo ON wo.id = pl."workOrderId"
      ${productionWhere}
        AND ${finalOperationCondition}
      GROUP BY pl."createdAt"::date
      ORDER BY pl."createdAt"::date ASC
    `,
    prisma.$queryRaw`
      SELECT
        TO_CHAR(date_trunc('month', COALESCE(wo."actualEndDate", wo."actualStartDate", wo."plannedStartDate", wo."updatedAt")), 'YYYY-MM') AS period,
        COUNT(*)::int AS work_order_count,
        COUNT(*) FILTER (WHERE wo."status"::text = 'COMPLETED')::int AS completed_work_order_count,
        COALESCE(SUM(wo."plannedQuantity"), 0)::int AS planned_quantity,
        COALESCE(SUM(wo."producedQuantity"), 0)::int AS produced_quantity,
        COALESCE(SUM(wo."scrapQuantity"), 0)::int AS scrap_quantity
      FROM "WorkOrder" wo
      ${workOrderWhere}
      GROUP BY date_trunc('month', COALESCE(wo."actualEndDate", wo."actualStartDate", wo."plannedStartDate", wo."updatedAt"))
      ORDER BY period ASC
    `,
    prisma.$queryRaw`
      SELECT
        m.id AS machine_id,
        m.code AS machine_code,
        m.name AS machine_name,
        COALESCE(SUM(pl."producedQuantity"), 0)::int AS produced_quantity,
        COALESCE(SUM(pl."scrapQuantity"), 0)::int AS scrap_quantity,
        COUNT(*)::int AS log_count
      FROM "ProductionLog" pl
      JOIN "WorkOrder" wo ON wo.id = pl."workOrderId"
      JOIN "Machine" m ON m.id = pl."machineId"
      ${productionWhere}
      GROUP BY m.id, m.code, m.name
      ORDER BY produced_quantity DESC, scrap_quantity ASC
    `,
    prisma.$queryRaw`
      SELECT
        COALESCE(s.id, 'UNASSIGNED') AS shift_id,
        COALESCE(s.name, 'Vardiya Yok') AS shift_name,
        CASE WHEN s.id IS NULL THEN '-' ELSE CONCAT(s."startTime", '-', s."endTime") END AS shift_time_range,
        COALESCE(SUM(pl."producedQuantity"), 0)::int AS produced_quantity,
        COALESCE(SUM(pl."scrapQuantity"), 0)::int AS scrap_quantity,
        COUNT(*)::int AS log_count,
        COUNT(DISTINCT pl."operatorId")::int AS operator_count,
        COUNT(DISTINCT pl."machineId")::int AS machine_count
      FROM "ProductionLog" pl
      JOIN "WorkOrder" wo ON wo.id = pl."workOrderId"
      LEFT JOIN "Shift" s ON s.id = pl."shiftId"
      ${productionWhere}
      GROUP BY s.id, s.name, s."startTime", s."endTime"
      ORDER BY produced_quantity DESC, scrap_quantity ASC
    `,
    prisma.$queryRaw`
      SELECT
        COALESCE(s.id, 'UNASSIGNED') AS shift_id,
        COALESCE(s.name, 'Vardiya Yok') AS shift_name,
        CASE WHEN s.id IS NULL THEN '-' ELSE CONCAT(s."startTime", '-', s."endTime") END AS shift_time_range,
        u.id AS operator_id,
        u.name AS operator_name,
        COALESCE(SUM(pl."producedQuantity"), 0)::int AS produced_quantity,
        COALESCE(SUM(pl."scrapQuantity"), 0)::int AS scrap_quantity,
        COUNT(*)::int AS log_count
      FROM "ProductionLog" pl
      JOIN "WorkOrder" wo ON wo.id = pl."workOrderId"
      JOIN "User" u ON u.id = pl."operatorId"
      LEFT JOIN "Shift" s ON s.id = pl."shiftId"
      ${productionWhere}
      GROUP BY s.id, s.name, s."startTime", s."endTime", u.id, u.name
      ORDER BY produced_quantity DESC, scrap_quantity ASC
    `,
    prisma.$queryRaw`
      SELECT
        COALESCE(s.id, 'UNASSIGNED') AS shift_id,
        COALESCE(s.name, 'Vardiya Yok') AS shift_name,
        CASE WHEN s.id IS NULL THEN '-' ELSE CONCAT(s."startTime", '-', s."endTime") END AS shift_time_range,
        m.id AS machine_id,
        m.code AS machine_code,
        m.name AS machine_name,
        COALESCE(SUM(pl."producedQuantity"), 0)::int AS produced_quantity,
        COALESCE(SUM(pl."scrapQuantity"), 0)::int AS scrap_quantity,
        COUNT(*)::int AS log_count
      FROM "ProductionLog" pl
      JOIN "WorkOrder" wo ON wo.id = pl."workOrderId"
      JOIN "Machine" m ON m.id = pl."machineId"
      LEFT JOIN "Shift" s ON s.id = pl."shiftId"
      ${productionWhere}
      GROUP BY s.id, s.name, s."startTime", s."endTime", m.id, m.code, m.name
      ORDER BY produced_quantity DESC, scrap_quantity ASC
    `,
    prisma.$queryRaw`
      WITH operation_base AS (
        SELECT
          woo.id AS operation_id,
          wo."orderNo" AS order_no,
          p.code AS product_code,
          p.name AS product_name,
          woo."operationName" AS operation_name,
          woo.status::text AS status,
          woo."routeOperationId" AS route_operation_id,
          woo."machineId" AS machine_id,
          COALESCE(m.code, 'Makine Yok') AS machine_code,
          COALESCE(m.name, 'Makine Yok') AS machine_name,
          woo."assignedOperatorId" AS operator_id,
          COALESCE(u.name, 'Operatör Yok') AS operator_name,
          COALESCE(ro."estimatedMinutes", 0)::numeric AS planned_minutes,
          GREATEST(EXTRACT(EPOCH FROM (COALESCE(woo."completedAt", NOW()) - woo."startedAt")) / 60, 0)::numeric AS actual_minutes,
          COALESCE((
            SELECT SUM(GREATEST(EXTRACT(EPOCH FROM (COALESCE(od."endedAt", COALESCE(woo."completedAt", NOW())) - od."startedAt")) / 60, 0))
            FROM "operation_downtimes" od
            WHERE od."workOrderOperationId" = woo.id
          ), 0)::numeric AS downtime_minutes,
          woo."producedQuantity"::numeric AS produced_quantity,
          woo."scrapQuantity"::numeric AS scrap_quantity,
          (woo."producedQuantity" + woo."scrapQuantity")::numeric AS total_processed_quantity,
          wo."plannedQuantity"::numeric AS work_order_planned_quantity,
          woo."startedAt" AS started_at,
          woo."completedAt" AS completed_at
        FROM "work_order_operations" woo
        JOIN "WorkOrder" wo ON wo.id = woo."workOrderId"
        JOIN "Product" p ON p.id = wo."productId"
        LEFT JOIN "route_operations" ro ON ro.id = woo."routeOperationId"
        LEFT JOIN "Machine" m ON m.id = woo."machineId"
        LEFT JOIN "User" u ON u.id = woo."assignedOperatorId"
        ${operationWhere}
      )
      SELECT
        *,
        GREATEST(actual_minutes - downtime_minutes, 0)::float AS net_minutes,
        CASE
          WHEN planned_minutes > 0 THEN GREATEST(GREATEST(actual_minutes - downtime_minutes, 0) - planned_minutes, 0)
          ELSE 0
        END::float AS delay_minutes,
        CASE
          WHEN planned_minutes > 0 AND work_order_planned_quantity > 0
          THEN LEAST(planned_minutes * (total_processed_quantity / work_order_planned_quantity), planned_minutes)
          ELSE 0
        END::float AS ideal_run_minutes
      FROM operation_base
      ORDER BY delay_minutes DESC, started_at DESC
      LIMIT 250
    `,
    prisma.$queryRaw`
      SELECT od.reason::text AS reason, COUNT(*)::int AS total_count
      FROM "operation_downtimes" od
      JOIN "WorkOrder" wo ON wo.id = od."workOrderId"
      JOIN "work_order_operations" woo ON woo.id = od."workOrderOperationId"
      ${downtimeWhere}
      GROUP BY od.reason
      ORDER BY total_count DESC
    `,
    prisma.$queryRaw`
      SELECT
        COALESCE(s.id, 'UNASSIGNED') AS shift_id,
        COALESCE(s.name, 'Vardiya Yok') AS shift_name,
        od.reason::text AS reason,
        COUNT(*)::int AS total_count
      FROM "operation_downtimes" od
      JOIN "WorkOrder" wo ON wo.id = od."workOrderId"
      JOIN "work_order_operations" woo ON woo.id = od."workOrderOperationId"
      LEFT JOIN "Shift" s ON s.id = od."shiftId"
      ${downtimeWhere}
      GROUP BY s.id, s.name, od.reason
      ORDER BY total_count DESC
    `,
    prisma.$queryRaw`
      SELECT
        COALESCE(m.id, 'UNASSIGNED') AS machine_id,
        COALESCE(m.code, 'Makine Yok') AS machine_code,
        COALESCE(m.name, 'Makine Yok') AS machine_name,
        od.reason::text AS reason,
        COUNT(*)::int AS total_count
      FROM "operation_downtimes" od
      JOIN "WorkOrder" wo ON wo.id = od."workOrderId"
      JOIN "work_order_operations" woo ON woo.id = od."workOrderOperationId"
      LEFT JOIN "Machine" m ON m.id = od."machineId"
      ${downtimeWhere}
      GROUP BY m.id, m.code, m.name, od.reason
      ORDER BY total_count DESC
    `,
    prisma.$queryRaw`
      SELECT
        woo.id AS operation_id,
        woo."operationName" AS operation_name,
        wo."orderNo" AS order_no,
        p.code AS product_code,
        od.reason::text AS reason,
        COUNT(*)::int AS total_count
      FROM "operation_downtimes" od
      JOIN "WorkOrder" wo ON wo.id = od."workOrderId"
      JOIN "Product" p ON p.id = wo."productId"
      JOIN "work_order_operations" woo ON woo.id = od."workOrderOperationId"
      ${downtimeWhere}
      GROUP BY woo.id, woo."operationName", wo."orderNo", p.code, od.reason
      ORDER BY total_count DESC
    `
  ]);

  const oeeOverall = createOeeGroup({ scope: "OVERALL", label: "Genel" });
  const oeeByMachineMap = {};
  const oeeByOperationMap = {};
  const timeByMachineMap = {};
  const timeByOperatorMap = {};

  const operationTimePerformance = operationMetricRows.map((row) => {
    addOeeRow(oeeOverall, row);

    const machineKey = row.machine_id ?? "UNASSIGNED";
    if (!oeeByMachineMap[machineKey]) {
      oeeByMachineMap[machineKey] = createOeeGroup({
        machineId: machineKey,
        machineCode: row.machine_code,
        machineName: row.machine_name
      });
    }
    addOeeRow(oeeByMachineMap[machineKey], row);
    addTimeRow(
      timeByMachineMap,
      machineKey,
      {
        machineId: machineKey,
        machineCode: row.machine_code,
        machineName: row.machine_name
      },
      row
    );

    const operationKey = `${row.route_operation_id ?? row.operation_name}:${row.operation_name}`;
    if (!oeeByOperationMap[operationKey]) {
      oeeByOperationMap[operationKey] = createOeeGroup({
        operationKey,
        operationName: row.operation_name
      });
    }
    addOeeRow(oeeByOperationMap[operationKey], row);

    const operatorKey = row.operator_id ?? "UNASSIGNED";
    addTimeRow(
      timeByOperatorMap,
      operatorKey,
      {
        operatorId: operatorKey,
        operatorName: row.operator_name
      },
      row
    );

    return {
      operationId: row.operation_id,
      orderNo: row.order_no,
      productCode: row.product_code,
      productName: row.product_name,
      operationName: row.operation_name,
      status: row.status,
      machineId: row.machine_id,
      machineCode: row.machine_code,
      machineName: row.machine_name,
      operatorId: row.operator_id,
      operatorName: row.operator_name,
      plannedMinutes: toNumber(row.planned_minutes),
      actualMinutes: toNumber(row.actual_minutes),
      downtimeMinutes: toNumber(row.downtime_minutes),
      netMinutes: toNumber(row.net_minutes),
      delayMinutes: toNumber(row.delay_minutes),
      producedQuantity: toNumber(row.produced_quantity),
      scrapQuantity: toNumber(row.scrap_quantity),
      totalProcessedQuantity: toNumber(row.total_processed_quantity),
      idealRunMinutes: toNumber(row.ideal_run_minutes),
      startedAt: row.started_at,
      completedAt: row.completed_at
    };
  });

  return {
    processTotals: mapProductionTotals(processTotalsRows[0]),
    finalProductTotals: mapProductionTotals(finalTotalsRows[0]),
    productionTrend: productionTrendRows.map((row) => ({
      date: row.date,
      producedQuantity: toNumber(row.produced_quantity),
      scrapQuantity: toNumber(row.scrap_quantity),
      logCount: toNumber(row.log_count),
      scrapRate: scrapRate(row.produced_quantity, row.scrap_quantity)
    })),
    planActualPerformance: planActualRows.map((row) => ({
      period: row.period,
      label: monthLabel(row.period),
      workOrderCount: toNumber(row.work_order_count),
      completedWorkOrderCount: toNumber(row.completed_work_order_count),
      plannedQuantity: toNumber(row.planned_quantity),
      producedQuantity: toNumber(row.produced_quantity),
      scrapQuantity: toNumber(row.scrap_quantity),
      gapQuantity: Math.max(toNumber(row.planned_quantity) - toNumber(row.produced_quantity), 0),
      completionRate: percent(row.produced_quantity, row.planned_quantity),
      scrapRate: scrapRate(row.produced_quantity, row.scrap_quantity)
    })),
    machinePerformance: machinePerformanceRows.map((row) => ({
      machineId: row.machine_id,
      machineCode: row.machine_code,
      machineName: row.machine_name,
      producedQuantity: toNumber(row.produced_quantity),
      scrapQuantity: toNumber(row.scrap_quantity),
      logCount: toNumber(row.log_count),
      scrapRate: scrapRate(row.produced_quantity, row.scrap_quantity)
    })),
    shiftPerformance: shiftPerformanceRows.map((row) => ({
      shiftId: row.shift_id,
      shiftName: row.shift_name,
      shiftTimeRange: row.shift_time_range,
      producedQuantity: toNumber(row.produced_quantity),
      scrapQuantity: toNumber(row.scrap_quantity),
      logCount: toNumber(row.log_count),
      operatorCount: toNumber(row.operator_count),
      machineCount: toNumber(row.machine_count),
      scrapRate: scrapRate(row.produced_quantity, row.scrap_quantity)
    })),
    operatorShiftPerformance: operatorShiftRows.map((row) => ({
      shiftId: row.shift_id,
      shiftName: row.shift_name,
      shiftTimeRange: row.shift_time_range,
      operatorId: row.operator_id,
      operatorName: row.operator_name,
      producedQuantity: toNumber(row.produced_quantity),
      scrapQuantity: toNumber(row.scrap_quantity),
      logCount: toNumber(row.log_count),
      scrapRate: scrapRate(row.produced_quantity, row.scrap_quantity)
    })),
    machineShiftPerformance: machineShiftRows.map((row) => ({
      shiftId: row.shift_id,
      shiftName: row.shift_name,
      shiftTimeRange: row.shift_time_range,
      machineId: row.machine_id,
      machineCode: row.machine_code,
      machineName: row.machine_name,
      producedQuantity: toNumber(row.produced_quantity),
      scrapQuantity: toNumber(row.scrap_quantity),
      logCount: toNumber(row.log_count),
      scrapRate: scrapRate(row.produced_quantity, row.scrap_quantity)
    })),
    operationTimePerformance,
    delayedOperations: operationTimePerformance.filter((operation) => operation.delayMinutes > 0).sort((first, second) => second.delayMinutes - first.delayMinutes),
    operationTimeByMachine: Object.values(timeByMachineMap).map(finalizeTimeGroup).sort((first, second) => second.delayMinutes - first.delayMinutes),
    operationTimeByOperator: Object.values(timeByOperatorMap).map(finalizeTimeGroup).sort((first, second) => second.delayMinutes - first.delayMinutes),
    oeeSummary: finalizeOeeGroup(oeeOverall),
    oeeByMachine: Object.values(oeeByMachineMap).map(finalizeOeeGroup).sort((first, second) => second.oee - first.oee),
    oeeByOperation: Object.values(oeeByOperationMap).map(finalizeOeeGroup).sort((first, second) => second.oee - first.oee),
    operationDowntimeReasonCounts: downtimeReasonRows.reduce((acc, row) => {
      acc[row.reason] = toNumber(row.total_count);
      return acc;
    }, {}),
    operationDowntimeByShift: groupDowntimeRows(downtimeShiftRows, "shift_id", (row) => ({
      shiftId: row.shift_id,
      shiftName: row.shift_name
    })),
    operationDowntimeByMachine: groupDowntimeRows(downtimeMachineRows, "machine_id", (row) => ({
      machineId: row.machine_id,
      machineCode: row.machine_code,
      machineName: row.machine_name
    })),
    operationDowntimeByOperation: groupDowntimeRows(downtimeOperationRows, "operation_id", (row) => ({
      operationId: row.operation_id,
      operationName: row.operation_name,
      orderNo: row.order_no,
      productCode: row.product_code
    }))
  };
}
