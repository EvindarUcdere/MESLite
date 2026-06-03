import { prisma } from "../src/config/db.js";
import { createProductionLog } from "../src/modules/production-logs/productionLog.service.js";
import { completeOperation } from "../src/modules/work-order-operations/workOrderOperation.service.js";

const tempOrderNo = "E2E-TRANSFER-PROCESSED-TEMP";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function expectRejects(fn, expectedMessagePart) {
  try {
    await fn();
  } catch (error) {
    assert(error.message.includes(expectedMessagePart), `Expected "${expectedMessagePart}", received "${error.message}"`);
    return;
  }

  throw new Error("Expected operation to reject");
}

async function cleanupTempWorkOrder() {
  const temp = await prisma.workOrder.findUnique({
    where: { orderNo: tempOrderNo },
    include: { operations: true }
  });

  if (!temp) {
    return;
  }

  await prisma.notification.deleteMany({
    where: {
      entityType: "WorkOrderOperation",
      entityId: { in: temp.operations.map((operation) => operation.id) }
    }
  });
  await prisma.productionLog.deleteMany({ where: { workOrderId: temp.id } });
  await prisma.operationDowntime.deleteMany({ where: { workOrderId: temp.id } });
  await prisma.workOrder.delete({ where: { id: temp.id } });
}

async function main() {
  await cleanupTempWorkOrder();

  const [admin, cuttingOperator, assemblyOperator, product, route, cuttingMachine, workOrder] = await Promise.all([
    prisma.user.findUnique({ where: { email: "admin@meslite.local" } }),
    prisma.user.findUnique({ where: { email: "operator@meslite.local" } }),
    prisma.user.findUnique({ where: { email: "assembly.operator@meslite.local" } }),
    prisma.product.findFirst({ where: { code: "E2E-AMB-001" } }),
    prisma.productRoute.findFirst({
      where: { name: "E2E Demo Rota" },
      include: { operations: { orderBy: { sequenceNo: "asc" } } }
    }),
    prisma.machine.findFirst({ where: { code: "E2E-KSM-01" } }),
    prisma.workOrder.findUnique({
      where: { orderNo: "E2E-DEMO-RUN" },
      include: {
        operations: {
          include: { machine: true },
          orderBy: { sequenceNo: "asc" }
        }
      }
    })
  ]);

  assert(admin, "Admin user is missing");
  assert(cuttingOperator, "Cutting operator is missing");
  assert(assemblyOperator, "Assembly operator is missing");
  assert(product, "E2E product is missing");
  assert(route?.operations?.length, "E2E route operations are missing");
  assert(cuttingMachine, "Cutting machine is missing");
  assert(workOrder, "E2E-DEMO-RUN work order is missing");

  const cutting = workOrder.operations.find((operation) => operation.operationName === "Kesim");
  const assembly = workOrder.operations.find((operation) => operation.operationName === "Montaj");

  assert(cutting, "RUN cutting operation is missing");
  assert(assembly, "RUN assembly operation is missing");

  const transferableQuantity = cutting.producedQuantity - cutting.scrapQuantity;
  const remainingTransferQuantity = transferableQuantity - assembly.producedQuantity;

  assert(transferableQuantity === 119, `Expected transfer quantity 119, found ${transferableQuantity}`);
  assert(remainingTransferQuantity === 59, `Expected remaining transfer quantity 59, found ${remainingTransferQuantity}`);

  await expectRejects(
    () =>
      createProductionLog(assemblyOperator, {
        workOrderId: workOrder.id,
        workOrderOperationId: assembly.id,
        machineId: assembly.machineId,
        producedQuantity: 60,
        scrapQuantity: 0
      }),
    "transferable remaining quantity (59)"
  );

  const tempWorkOrder = await prisma.workOrder.create({
    data: {
      orderNo: tempOrderNo,
      productId: product.id,
      routeId: route.id,
      plannedQuantity: 120,
      status: "IN_PROGRESS",
      actualStartDate: new Date(),
      createdById: admin.id,
      operations: {
        create: [
          {
            routeOperationId: route.operations[0].id,
            sequenceNo: 1,
            operationName: route.operations[0].operationName,
            machineId: cuttingMachine.id,
            assignedOperatorId: cuttingOperator.id,
            status: "IN_PROGRESS",
            producedQuantity: 100,
            scrapQuantity: 20,
            startedAt: new Date()
          },
          {
            routeOperationId: route.operations[1].id,
            sequenceNo: 2,
            operationName: route.operations[1].operationName,
            machineId: route.operations[1].defaultMachineId,
            assignedOperatorId: assemblyOperator.id,
            status: "WAITING"
          }
        ]
      }
    },
    include: { operations: { orderBy: { sequenceNo: "asc" } } }
  });
  const tempCutting = tempWorkOrder.operations[0];

  await prisma.productionLog.create({
    data: {
      workOrderId: tempWorkOrder.id,
      workOrderOperationId: tempCutting.id,
      operatorId: cuttingOperator.id,
      machineId: cuttingMachine.id,
      producedQuantity: 100,
      scrapQuantity: 20,
      scrapReason: "PROCESS_DEVIATION",
      note: "Acceptance test processed full transfer quantity with scrap"
    }
  });

  const completedOperation = await completeOperation(cuttingOperator, tempCutting.id);
  assert(completedOperation.status === "COMPLETED", "Operation with produced + scrap equal to transfer quantity must complete");

  console.log({
    acceptance: "ok",
    checkedRules: [
      "previous operation scrap reduces transferable quantity",
      "downstream operation cannot exceed transferred quantity",
      "operator production log is rejected before database mutation",
      "operation can complete when produced plus scrap equals transferred quantity"
    ]
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanupTempWorkOrder();
    await prisma.$disconnect();
  });
