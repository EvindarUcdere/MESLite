import bcrypt from "bcryptjs";
import { prisma } from "../src/config/db.js";
import { createProductionLog } from "../src/modules/production-logs/productionLog.service.js";

const PREFIX = "E2E-CONCURRENCY";
const passwordHash = await bcrypt.hash("Admin123!", 10);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function cleanup() {
  const workOrders = await prisma.workOrder.findMany({
    where: { orderNo: { startsWith: PREFIX } },
    include: { operations: true, productionLogs: true, productionAlerts: true }
  });

  const workOrderIds = workOrders.map((workOrder) => workOrder.id);
  const operationIds = workOrders.flatMap((workOrder) => workOrder.operations.map((operation) => operation.id));
  const productionLogIds = workOrders.flatMap((workOrder) => workOrder.productionLogs.map((log) => log.id));
  const alertIds = workOrders.flatMap((workOrder) => workOrder.productionAlerts.map((alert) => alert.id));

  await prisma.notification.deleteMany({ where: { entityId: { in: [...workOrderIds, ...operationIds, ...productionLogIds, ...alertIds] } } });
  await prisma.operationMessage.deleteMany({ where: { workOrderOperationId: { in: operationIds } } });
  await prisma.productionAlertEvent.deleteMany({ where: { alertId: { in: alertIds } } });
  await prisma.productionAlert.deleteMany({ where: { workOrderId: { in: workOrderIds } } });
  await prisma.productionLogAttachment.deleteMany({ where: { productionLogId: { in: productionLogIds } } });
  await prisma.productionLog.deleteMany({ where: { workOrderId: { in: workOrderIds } } });
  await prisma.qualityCheck.deleteMany({ where: { workOrderId: { in: workOrderIds } } });
  await prisma.operationDowntime.deleteMany({ where: { workOrderId: { in: workOrderIds } } });
  await prisma.workOrderOperation.deleteMany({ where: { workOrderId: { in: workOrderIds } } });
  await prisma.workOrder.deleteMany({ where: { id: { in: workOrderIds } } });
  await prisma.auditLog.deleteMany({ where: { summary: { contains: PREFIX } } });
}

async function createFixture() {
  const admin = await prisma.user.upsert({
    where: { email: "phase4.concurrency.admin@meslite.local" },
    update: { role: "ADMIN", isActive: true },
    create: {
      name: "Concurrency Admin",
      email: "phase4.concurrency.admin@meslite.local",
      passwordHash,
      role: "ADMIN"
    }
  });

  const operator = await prisma.user.upsert({
    where: { email: "phase4.concurrency.operator@meslite.local" },
    update: { role: "OPERATOR", isActive: true },
    create: {
      name: "Concurrency Operator",
      email: "phase4.concurrency.operator@meslite.local",
      passwordHash,
      role: "OPERATOR"
    }
  });

  const line = await prisma.productionLine.upsert({
    where: { name: `${PREFIX} Line` },
    update: { isActive: true },
    create: { name: `${PREFIX} Line`, description: "Concurrency acceptance test line" }
  });

  const machine = await prisma.machine.upsert({
    where: { code: `${PREFIX}-MCH` },
    update: { isActive: true, productionLineId: line.id },
    create: { code: `${PREFIX}-MCH`, name: "Concurrency Test Machine", productionLineId: line.id }
  });

  const product = await prisma.product.upsert({
    where: { code: `${PREFIX}-PRD` },
    update: { isActive: true },
    create: { code: `${PREFIX}-PRD`, name: "Concurrency Test Product", unit: "adet" }
  });

  const route = await prisma.productRoute.upsert({
    where: { productId_name: { productId: product.id, name: `${PREFIX} Route` } },
    update: { isActive: true },
    create: { productId: product.id, name: `${PREFIX} Route`, description: "Concurrency route" }
  });

  const routeOperation = await prisma.routeOperation.upsert({
    where: { routeId_sequenceNo: { routeId: route.id, sequenceNo: 1 } },
    update: { operationName: "Concurrency Step", defaultMachineId: machine.id, estimatedMinutes: 10 },
    create: { routeId: route.id, sequenceNo: 1, operationName: "Concurrency Step", defaultMachineId: machine.id, estimatedMinutes: 10 }
  });

  const plannedStartDate = new Date();
  const workOrder = await prisma.workOrder.create({
    data: {
      orderNo: `${PREFIX}-${Date.now()}`,
      productId: product.id,
      routeId: route.id,
      machineId: machine.id,
      assignedOperatorId: operator.id,
      plannedQuantity: 20,
      isTestData: true,
      plannedStartDate,
      plannedEndDate: new Date(plannedStartDate.getTime() + 10 * 60_000),
      status: "IN_PROGRESS",
      actualStartDate: new Date(),
      createdById: admin.id,
      operations: {
        create: {
          routeOperationId: routeOperation.id,
          machineId: machine.id,
          assignedOperatorId: operator.id,
          sequenceNo: 1,
          operationName: routeOperation.operationName,
          status: "IN_PROGRESS",
          startedAt: new Date()
        }
      }
    },
    include: { operations: true }
  });

  return { operator, workOrder, operation: workOrder.operations[0], machine };
}

async function main() {
  await cleanup();
  const { operator, workOrder, operation, machine } = await createFixture();

  await createProductionLog(operator, {
    workOrderId: workOrder.id,
    workOrderOperationId: operation.id,
    expectedOperationVersion: operation.version,
    machineId: machine.id,
    producedQuantity: 1,
    scrapQuantity: 0,
    note: `${PREFIX} first write`
  });

  let conflictError = null;

  try {
    await createProductionLog(operator, {
      workOrderId: workOrder.id,
      workOrderOperationId: operation.id,
      expectedOperationVersion: operation.version,
      machineId: machine.id,
      producedQuantity: 1,
      scrapQuantity: 0,
      note: `${PREFIX} stale write`
    });
  } catch (error) {
    conflictError = error;
  }

  const refreshedOperation = await prisma.workOrderOperation.findUnique({ where: { id: operation.id } });
  const logs = await prisma.productionLog.findMany({ where: { workOrderOperationId: operation.id } });

  assert(conflictError?.statusCode === 409, "stale operation write must return 409 conflict");
  assert(refreshedOperation.version === operation.version + 1, "operation version must increase after accepted write");
  assert(refreshedOperation.producedQuantity === 1, "only the accepted production log must update operation quantity");
  assert(logs.length === 1, "stale write must not create an extra production log");

  console.log({
    acceptance: "ok",
    checkedRules: [
      "operation production write increments version",
      "stale operation version is rejected with 409",
      "rejected stale write does not create production log",
      "operation quantity is updated only once"
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
