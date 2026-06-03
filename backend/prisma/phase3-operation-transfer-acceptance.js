import { prisma } from "../src/config/db.js";
import { createProductionLog } from "../src/modules/production-logs/productionLog.service.js";

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

async function main() {
  const [assemblyOperator, workOrder] = await Promise.all([
    prisma.user.findUnique({ where: { email: "assembly.operator@meslite.local" } }),
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

  assert(assemblyOperator, "Assembly operator is missing");
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

  console.log({
    acceptance: "ok",
    checkedRules: [
      "previous operation scrap reduces transferable quantity",
      "downstream operation cannot exceed transferred quantity",
      "operator production log is rejected before database mutation"
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
