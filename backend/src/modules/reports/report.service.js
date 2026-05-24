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

export async function getOverviewReport() {
  const [workOrders, productionLogs, qualityChecks, machines] = await Promise.all([
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
    prisma.machine.findMany({ include: { productionLine: true } })
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

  const machinePerformance = Object.values(machinePerformanceMap).map((item) => ({
    ...item,
    scrapRate: scrapRate(item.producedQuantity, item.scrapQuantity)
  }));

  const productPerformance = Object.values(productPerformanceMap).map((item) => ({
    ...item,
    scrapRate: scrapRate(item.producedQuantity, item.scrapQuantity)
  }));

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
    qualityStatusCounts: countBy(qualityChecks, "status"),
    machinePerformance,
    productPerformance,
    recentProductionLogs: productionLogs.slice(0, 10),
    recentQualityChecks: qualityChecks.slice(0, 10)
  };
}
