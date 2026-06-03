import { PrismaClient } from "@prisma/client";
import { createProductionLog } from "../src/modules/production-logs/productionLog.service.js";
import { completeOperation, startOperation } from "../src/modules/work-order-operations/workOrderOperation.service.js";
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

async function expectRejects(action, messageIncludes) {
  try {
    await action();
  } catch (error) {
    if (messageIncludes) {
      assert(error.message.includes(messageIncludes), `Expected error to include "${messageIncludes}", got "${error.message}"`);
    }
    return error;
  }

  throw new Error(`Expected action to fail with "${messageIncludes}"`);
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

  assert(workOrders.length === 5, `Expected 5 demo work orders, found ${workOrders.length}`);

  const runOrder = workOrders.find((workOrder) => workOrder.orderNo === "E2E-DEMO-RUN");
  const pauseOrder = workOrders.find((workOrder) => workOrder.orderNo === "E2E-DEMO-PAUSE");
  const qualityOrder = workOrders.find((workOrder) => workOrder.orderNo === "E2E-DEMO-QUALITY");
  const pendingQualityOrder = workOrders.find((workOrder) => workOrder.orderNo === "E2E-DEMO-QUALITY-PENDING");
  const reopenOrder = workOrders.find((workOrder) => workOrder.orderNo === "E2E-DEMO-REOPEN");

  assert(runOrder, "E2E-DEMO-RUN is missing");
  assert(pauseOrder, "E2E-DEMO-PAUSE is missing");
  assert(qualityOrder, "E2E-DEMO-QUALITY is missing");
  assert(pendingQualityOrder, "E2E-DEMO-QUALITY-PENDING is missing");
  assert(reopenOrder, "E2E-DEMO-REOPEN is missing");

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
    include: {
      operations: {
        include: {
          assignedOperator: true,
          machine: true
        },
        orderBy: { sequenceNo: "asc" }
      }
    }
  });
  assert(restartedRunOrder.status === "IN_PROGRESS", "Restarting a paused routed work order must restart the work order");
  assert(operationByName(restartedRunOrder, "Montaj").status === "IN_PROGRESS", "Restarting a paused routed work order must restart the paused operation");

  assert(pauseOrder.status === "PAUSED", "PAUSE order must be paused");
  assert(pauseOrder.producedQuantity === 0, "PAUSE order final produced quantity must not include paused upstream operations");
  assert(operationByName(pauseOrder, "Montaj").status === "PAUSED", "PAUSE Montaj must be paused");
  assert(operationByName(pauseOrder, "Montaj").messages.some((message) => message.severity === "STOPPAGE"), "PAUSE Montaj must include stoppage message");

  await expectRejects(
    () => completeOperation(operationByName(pauseOrder, "Montaj").assignedOperator, operationByName(pauseOrder, "Montaj").id),
    "Operation cannot be completed before transferable quantity is produced"
  );

  assert(qualityOrder.status === "COMPLETED", "QUALITY order must be completed");
  assert(qualityOrder.producedQuantity === 49, "QUALITY order final produced quantity must equal final operation output after scrap transfer");
  assert(operationByName(qualityOrder, "Kalite Kontrol").producedQuantity === 49, "QUALITY final operation must produce transferred quantity");
  assert(qualityOrder.qualityChecks.length === 1, "QUALITY order must have one quality check");
  assert(qualityOrder.qualityChecks[0].workOrderOperation?.operationName === "Kalite Kontrol", "Quality check must be linked to final operation");
  assert(qualityOrder.qualityChecks[0].defectQuantity === 2, "Quality check defect quantity must be 2");

  assert(pendingQualityOrder.status === "COMPLETED", "QUALITY-PENDING order must be completed");
  assert(operationByName(pendingQualityOrder, "Kalite Kontrol").status === "COMPLETED", "QUALITY-PENDING quality operation must be completed");
  assert(pendingQualityOrder.qualityChecks.length === 0, "QUALITY-PENDING order must not have a quality result yet");

  assert(reopenOrder.status === "PAUSED", "REOPEN order must start paused");
  assert(operationByName(reopenOrder, "Kesim").status === "COMPLETED", "REOPEN Kesim must start completed");
  assert(operationByName(reopenOrder, "Kesim").producedQuantity === 48, "REOPEN Kesim must be short completed");
  assert(operationByName(reopenOrder, "Montaj").status === "PAUSED", "REOPEN Montaj must start paused");

  const admin = await prisma.user.findUnique({ where: { email: "admin@meslite.local" } });
  await startOperation(admin, operationByName(reopenOrder, "Kesim").id);
  const reopenedOrder = await prisma.workOrder.findUnique({
    where: { id: reopenOrder.id },
    include: { operations: { orderBy: { sequenceNo: "asc" } } }
  });
  assert(reopenedOrder.status === "IN_PROGRESS", "Reopening short-completed operation must restart the work order");
  assert(operationByName(reopenedOrder, "Kesim").status === "IN_PROGRESS", "Short-completed operation must reopen as in progress");
  assert(operationByName(reopenedOrder, "Kesim").producedQuantity === 48, "Reopened operation must keep previous production quantity");
  assert(operationByName(reopenedOrder, "Montaj").status === "WAITING", "Downstream operation without production must reset to waiting");

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

  const runMontaj = operationByName(restartedRunOrder, "Montaj");
  const runQuality = operationByName(restartedRunOrder, "Kalite Kontrol");
  const qualityNotificationCountBefore = await prisma.notification.count({
    where: {
      recipientId: runQuality.assignedOperatorId,
      type: "OPERATION_HANDOFF",
      entityId: runQuality.id
    }
  });

  await createProductionLog(runMontaj.assignedOperator, {
    workOrderId: restartedRunOrder.id,
    workOrderOperationId: runMontaj.id,
    machineId: runMontaj.machineId,
    producedQuantity: 59,
    scrapQuantity: 0,
    note: "Acceptance test: montaj devredilen adedi tamamladı."
  });

  const afterMontajLog = await prisma.workOrder.findUnique({
    where: { id: restartedRunOrder.id },
    include: { operations: { orderBy: { sequenceNo: "asc" } } }
  });

  assert(operationByName(afterMontajLog, "Montaj").producedQuantity === 119, "Montaj production log must increase operation quantity to transferred quantity 119");
  assert(afterMontajLog.producedQuantity === 0, "Intermediate Montaj production must not increase final work order quantity");

  await completeOperation(runMontaj.assignedOperator, runMontaj.id);

  const afterMontajComplete = await prisma.workOrder.findUnique({
    where: { id: restartedRunOrder.id },
    include: { operations: { orderBy: { sequenceNo: "asc" } } }
  });
  const readyQuality = operationByName(afterMontajComplete, "Kalite Kontrol");
  const qualityNotificationCountAfter = await prisma.notification.count({
    where: {
      recipientId: readyQuality.assignedOperatorId,
      type: "OPERATION_HANDOFF",
      entityId: readyQuality.id
    }
  });

  assert(operationByName(afterMontajComplete, "Montaj").status === "COMPLETED", "Completed Montaj operation must be completed");
  assert(readyQuality.status === "READY", "Completing Montaj must prepare the next quality operation");
  assert(
    qualityNotificationCountAfter === qualityNotificationCountBefore + 1,
    "Completing an operation must notify the next assigned operator"
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
      "short-completed operation reopen",
      "assigned active mobile operations",
      "operator cannot complete short production",
      "production log updates operation totals",
      "intermediate operation does not inflate final quantity",
      "operation handoff notification"
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
