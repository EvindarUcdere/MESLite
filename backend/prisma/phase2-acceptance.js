import { PrismaClient } from "@prisma/client";
import { pauseWorkOrder, startWorkOrder } from "../src/modules/work-orders/workOrder.service.js";

const prisma = new PrismaClient();

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function operationByName(workOrder, name) {
  return workOrder.operations.find((operation) => operation.operationName === name);
}

async function main() {
  const workOrders = await prisma.workOrder.findMany({
    where: {
      orderNo: {
        startsWith: "E2E-DEMO-"
      }
    },
    include: {
      operations: {
        include: {
          messages: true,
          productionLogs: true,
          assignedOperator: true,
          machine: true
        },
        orderBy: {
          sequenceNo: "asc"
        }
      },
      productionLogs: true,
      qualityChecks: {
        include: {
          workOrderOperation: true
        }
      }
    },
    orderBy: {
      orderNo: "asc"
    }
  });

  assert(workOrders.length === 3, `Expected 3 demo work orders, found ${workOrders.length}`);

  const runOrder = workOrders.find((workOrder) => workOrder.orderNo === "E2E-DEMO-RUN");
  const pauseOrder = workOrders.find((workOrder) => workOrder.orderNo === "E2E-DEMO-PAUSE");
  const qualityOrder = workOrders.find((workOrder) => workOrder.orderNo === "E2E-DEMO-QUALITY");

  assert(runOrder, "E2E-DEMO-RUN is missing");
  assert(pauseOrder, "E2E-DEMO-PAUSE is missing");
  assert(qualityOrder, "E2E-DEMO-QUALITY is missing");

  for (const workOrder of workOrders) {
    assert(workOrder.operations.length === 3, `${workOrder.orderNo} must have 3 operations`);
    assert(operationByName(workOrder, "Kesim"), `${workOrder.orderNo} is missing Kesim`);
    assert(operationByName(workOrder, "Montaj"), `${workOrder.orderNo} is missing Montaj`);
    assert(operationByName(workOrder, "Kalite Kontrol"), `${workOrder.orderNo} is missing Kalite Kontrol`);
  }

  assert(runOrder.status === "IN_PROGRESS", "RUN order must be in progress");
  assert(runOrder.producedQuantity === 0, "RUN order final produced quantity must not include partial upstream operations");
  assert(operationByName(runOrder, "Kesim").status === "COMPLETED", "RUN Kesim must be completed");
  assert(operationByName(runOrder, "Montaj").status === "IN_PROGRESS", "RUN Montaj must be in progress");
  assert(operationByName(runOrder, "Montaj").messages.length >= 2, "RUN Montaj must include operation messages");

  await pauseWorkOrder(runOrder.id);
  const pausedRunOrder = await prisma.workOrder.findUnique({
    where: { id: runOrder.id },
    include: { operations: { orderBy: { sequenceNo: "asc" } } }
  });
  assert(pausedRunOrder.status === "PAUSED", "Pausing a routed work order must pause the work order");
  assert(operationByName(pausedRunOrder, "Montaj").status === "PAUSED", "Pausing a routed work order must pause the active operation");

  await startWorkOrder(runOrder.id);
  const restartedRunOrder = await prisma.workOrder.findUnique({
    where: { id: runOrder.id },
    include: { operations: { orderBy: { sequenceNo: "asc" } } }
  });
  assert(restartedRunOrder.status === "IN_PROGRESS", "Restarting a paused routed work order must restart the work order");
  assert(operationByName(restartedRunOrder, "Montaj").status === "IN_PROGRESS", "Restarting a paused routed work order must restart the paused operation");

  assert(pauseOrder.status === "PAUSED", "PAUSE order must be paused");
  assert(pauseOrder.producedQuantity === 0, "PAUSE order final produced quantity must not include paused upstream operations");
  assert(operationByName(pauseOrder, "Montaj").status === "PAUSED", "PAUSE Montaj must be paused");
  assert(operationByName(pauseOrder, "Montaj").messages.some((message) => message.severity === "STOPPAGE"), "PAUSE Montaj must include stoppage message");

  assert(qualityOrder.status === "COMPLETED", "QUALITY order must be completed");
  assert(qualityOrder.producedQuantity === 50, "QUALITY order final produced quantity must equal final operation output");
  assert(operationByName(qualityOrder, "Kalite Kontrol").producedQuantity === 50, "QUALITY final operation must produce 50");
  assert(qualityOrder.qualityChecks.length === 1, "QUALITY order must have one quality check");
  assert(qualityOrder.qualityChecks[0].workOrderOperation?.operationName === "Kalite Kontrol", "Quality check must be linked to final operation");
  assert(qualityOrder.qualityChecks[0].defectQuantity === 2, "Quality check defect quantity must be 2");

  const activeAssignedOperations = await prisma.workOrderOperation.findMany({
    where: {
      assignedOperator: {
        email: {
          in: ["assembly.operator@meslite.local", "quality.operator@meslite.local"]
        }
      },
      status: {
        in: ["READY", "IN_PROGRESS", "PAUSED", "WAITING"]
      }
    },
    include: {
      assignedOperator: true,
      workOrder: true
    }
  });

  assert(
    activeAssignedOperations.some((operation) => operation.workOrder.orderNo === "E2E-DEMO-RUN" && operation.operationName === "Montaj"),
    "Assembly operator must have RUN Montaj operation"
  );
  assert(
    activeAssignedOperations.some((operation) => operation.workOrder.orderNo === "E2E-DEMO-PAUSE" && operation.operationName === "Montaj"),
    "Assembly operator must have PAUSE Montaj operation"
  );
  assert(
    activeAssignedOperations.some((operation) => operation.workOrder.orderNo === "E2E-DEMO-RUN" && operation.operationName === "Kalite Kontrol"),
    "Quality operator must see waiting quality operation for RUN"
  );

  console.log({
    acceptance: "ok",
    checkedWorkOrders: workOrders.map((workOrder) => workOrder.orderNo),
    checkedRules: [
      "demo work order count",
      "operation statuses",
      "operation messages",
      "work order pause/start operation sync",
      "paused operation",
      "final production quantity",
      "quality check operation link",
      "assigned active mobile operations"
    ]
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
