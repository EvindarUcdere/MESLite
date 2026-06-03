import { prisma } from "../src/config/db.js";

function calculateWorkOrderTotals(workOrder) {
  if (!workOrder.operations.length) {
    return {
      producedQuantity: workOrder.productionLogs.reduce((sum, log) => sum + log.producedQuantity, 0),
      scrapQuantity: workOrder.productionLogs.reduce((sum, log) => sum + log.scrapQuantity, 0)
    };
  }

  const finalOperation = workOrder.operations.at(-1);

  return {
    producedQuantity: finalOperation?.producedQuantity ?? 0,
    scrapQuantity: workOrder.operations.reduce((sum, operation) => sum + operation.scrapQuantity, 0)
  };
}

async function main() {
  const workOrders = await prisma.workOrder.findMany({
    include: {
      operations: {
        orderBy: { sequenceNo: "asc" }
      },
      productionLogs: true
    },
    orderBy: { createdAt: "asc" }
  });

  const updated = [];

  for (const workOrder of workOrders) {
    const totals = calculateWorkOrderTotals(workOrder);
    const needsUpdate = workOrder.producedQuantity !== totals.producedQuantity || workOrder.scrapQuantity !== totals.scrapQuantity;

    if (!needsUpdate) {
      continue;
    }

    await prisma.workOrder.update({
      where: { id: workOrder.id },
      data: totals
    });

    updated.push({
      orderNo: workOrder.orderNo,
      previous: {
        producedQuantity: workOrder.producedQuantity,
        scrapQuantity: workOrder.scrapQuantity
      },
      next: totals
    });
  }

  console.log(JSON.stringify({
    reconciled: updated.length,
    updated
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
