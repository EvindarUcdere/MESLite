import { prisma } from "../src/config/db.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isQualityOperation(operation) {
  return operation.operationName.toLowerCase().includes("kalite") || operation.operationName.toLowerCase().includes("quality");
}

async function main() {
  const workOrders = await prisma.workOrder.findMany({
    where: {
      orderNo: { startsWith: "E2E-DEMO" }
    },
    include: {
      operations: {
        orderBy: { sequenceNo: "asc" }
      },
      qualityChecks: true
    }
  });

  const checkedOperationIds = new Set(workOrders.flatMap((workOrder) => workOrder.qualityChecks.map((check) => check.workOrderOperationId).filter(Boolean)));
  const pendingQualityItems = workOrders.flatMap((workOrder) =>
    workOrder.operations
      .filter((operation) => operation.status === "COMPLETED" && operation.producedQuantity > 0 && isQualityOperation(operation) && !checkedOperationIds.has(operation.id))
      .map((operation) => ({ workOrder, operation }))
  );

  const pendingDemo = pendingQualityItems.find((item) => item.workOrder.orderNo === "E2E-DEMO-QUALITY-PENDING");
  const completedDemo = pendingQualityItems.find((item) => item.workOrder.orderNo === "E2E-DEMO-QUALITY");

  assert(pendingDemo, "QUALITY-PENDING must be listed as waiting for quality result");
  assert(pendingDemo.operation.operationName === "Kalite Kontrol", "Pending item must point to quality control operation");
  assert(pendingDemo.operation.producedQuantity === 100, "Pending quality operation production quantity must be visible");
  assert(!completedDemo, "QUALITY order already has quality result and must not be pending");

  console.log({
    acceptance: "ok",
    checkedRules: [
      "completed quality operation without result is pending",
      "quality operation with existing result is not pending",
      "pending quality item carries operation quantity"
    ]
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
