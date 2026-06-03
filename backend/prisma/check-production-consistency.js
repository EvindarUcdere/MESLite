import { prisma } from "../src/config/db.js";

function inspectWorkOrder(workOrder) {
  const issues = [];
  const operations = workOrder.operations;

  if (operations.length) {
    const finalOperation = operations.at(-1);
    const operationScrapTotal = operations.reduce((sum, operation) => sum + operation.scrapQuantity, 0);

    if (workOrder.producedQuantity !== finalOperation.producedQuantity) {
      issues.push({
        type: "WORK_ORDER_FINAL_PRODUCTION_MISMATCH",
        message: "Work order produced quantity must match final operation produced quantity",
        workOrderProducedQuantity: workOrder.producedQuantity,
        finalOperationProducedQuantity: finalOperation.producedQuantity
      });
    }

    if (workOrder.scrapQuantity !== operationScrapTotal) {
      issues.push({
        type: "WORK_ORDER_SCRAP_MISMATCH",
        message: "Work order scrap quantity must match operation scrap total",
        workOrderScrapQuantity: workOrder.scrapQuantity,
        operationScrapTotal
      });
    }

    for (let index = 1; index < operations.length; index += 1) {
      const previous = operations[index - 1];
      const current = operations[index];

      if (current.producedQuantity > previous.producedQuantity) {
        issues.push({
          type: "DOWNSTREAM_PRODUCTION_EXCEEDS_PREVIOUS_OPERATION",
          message: "A downstream operation produced more than the previous operation",
          previousOperation: {
            sequenceNo: previous.sequenceNo,
            operationName: previous.operationName,
            producedQuantity: previous.producedQuantity
          },
          currentOperation: {
            sequenceNo: current.sequenceNo,
            operationName: current.operationName,
            producedQuantity: current.producedQuantity
          }
        });
      }

      if (previous.status === "COMPLETED" && previous.producedQuantity < workOrder.plannedQuantity && current.producedQuantity > 0) {
        issues.push({
          type: "DOWNSTREAM_STARTED_AFTER_SHORT_COMPLETED_OPERATION",
          message: "A downstream operation has production after an upstream operation was completed below planned quantity",
          previousOperation: {
            sequenceNo: previous.sequenceNo,
            operationName: previous.operationName,
            producedQuantity: previous.producedQuantity,
            plannedQuantity: workOrder.plannedQuantity
          },
          currentOperation: {
            sequenceNo: current.sequenceNo,
            operationName: current.operationName,
            producedQuantity: current.producedQuantity
          }
        });
      }
    }
  }

  return issues.length
    ? {
        orderNo: workOrder.orderNo,
        status: workOrder.status,
        plannedQuantity: workOrder.plannedQuantity,
        producedQuantity: workOrder.producedQuantity,
        scrapQuantity: workOrder.scrapQuantity,
        issues
      }
    : null;
}

async function main() {
  const workOrders = await prisma.workOrder.findMany({
    include: {
      operations: {
        orderBy: { sequenceNo: "asc" }
      }
    },
    orderBy: { createdAt: "asc" }
  });

  const inconsistentWorkOrders = workOrders.map(inspectWorkOrder).filter(Boolean);

  console.log(JSON.stringify({
    checked: workOrders.length,
    inconsistent: inconsistentWorkOrders.length,
    workOrders: inconsistentWorkOrders
  }, null, 2));

  if (inconsistentWorkOrders.length > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
