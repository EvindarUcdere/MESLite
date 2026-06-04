import { prisma } from "../src/config/db.js";
import { startOperation, createOperationMessage } from "../src/modules/work-order-operations/workOrderOperation.service.js";

let operationSnapshot = null;
let workOrderSnapshot = null;
let machineSnapshot = null;
let downtimeSnapshots = [];
let createdMessageId = null;
const messageText = "Acceptance test: operatorden yonetime saha mesaji";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const [manager, aliKaya, pausedOrder] = await Promise.all([
    prisma.user.findUnique({ where: { email: "manager@meslite.local" } }),
    prisma.user.findUnique({ where: { email: "assembly.operator@meslite.local" } }),
    prisma.workOrder.findUnique({
      where: { orderNo: "E2E-DEMO-PAUSE" },
      include: {
        operations: {
          include: { machine: true },
          orderBy: { sequenceNo: "asc" }
        }
      }
    })
  ]);

  assert(manager, "Production manager is missing");
  assert(aliKaya, "Ali Kaya operator is missing");
  assert(pausedOrder, "E2E-DEMO-PAUSE work order is missing");

  const pausedOperation =
    pausedOrder.operations.find((operation) => operation.status === "PAUSED" && operation.assignedOperatorId === aliKaya.id) ??
    pausedOrder.operations.find((operation) => operation.assignedOperatorId === aliKaya.id);
  assert(pausedOperation, "Operation assigned to Ali Kaya is missing");

  operationSnapshot = {
    id: pausedOperation.id,
    status: pausedOperation.status,
    startedAt: pausedOperation.startedAt,
    completedAt: pausedOperation.completedAt
  };
  workOrderSnapshot = {
    id: pausedOrder.id,
    status: pausedOrder.status,
    actualStartDate: pausedOrder.actualStartDate,
    actualEndDate: pausedOrder.actualEndDate
  };
  if (pausedOperation.machineId) {
    machineSnapshot = await prisma.machine.findUnique({ where: { id: pausedOperation.machineId } });
  }
  downtimeSnapshots = await prisma.operationDowntime.findMany({
    where: { workOrderOperationId: pausedOperation.id }
  });

  if (pausedOperation.status !== "PAUSED" || pausedOrder.status !== "PAUSED") {
    await prisma.workOrderOperation.update({
      where: { id: pausedOperation.id },
      data: {
        status: "PAUSED",
        startedAt: pausedOperation.startedAt ?? new Date(),
        completedAt: null
      }
    });
    await prisma.workOrder.update({
      where: { id: pausedOrder.id },
      data: {
        status: "PAUSED",
        actualEndDate: null
      }
    });
  }

  const restartNotificationCountBefore = await prisma.notification.count({
    where: {
      recipientId: aliKaya.id,
      type: "OPERATION_RESTARTED",
      entityId: pausedOperation.id
    }
  });

  await startOperation(manager, pausedOperation.id);

  const restartNotificationCountAfter = await prisma.notification.count({
    where: {
      recipientId: aliKaya.id,
      type: "OPERATION_RESTARTED",
      entityId: pausedOperation.id
    }
  });

  assert(restartNotificationCountAfter === restartNotificationCountBefore + 1, "Manager restart must notify assigned operator");

  const managementFieldMessageCountBefore = await prisma.notification.count({
    where: {
      type: "OPERATOR_FIELD_MESSAGE",
      entityId: pausedOperation.id
    }
  });

  const message = await createOperationMessage(aliKaya, pausedOperation.id, {
    severity: "WARNING",
    message: messageText
  });
  createdMessageId = message.id;

  const managementFieldMessageCountAfter = await prisma.notification.count({
    where: {
      type: "OPERATOR_FIELD_MESSAGE",
      entityId: pausedOperation.id
    }
  });

  assert(managementFieldMessageCountAfter >= managementFieldMessageCountBefore + 2, "Operator field message must notify management users");

  console.log({
    acceptance: "ok",
    checkedRules: [
      "manager restart creates operator notification",
      "operator operation message creates management notification",
      "notifications keep work order routing metadata"
    ]
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (operationSnapshot?.id) {
      await prisma.notification.deleteMany({
        where: {
          OR: [
            { type: "OPERATION_RESTARTED", entityId: operationSnapshot.id },
            { type: "OPERATOR_FIELD_MESSAGE", entityId: operationSnapshot.id }
          ]
        }
      });
    }

    if (createdMessageId) {
      await prisma.operationMessage.deleteMany({ where: { id: createdMessageId } });
    }

    for (const downtime of downtimeSnapshots) {
      await prisma.operationDowntime.update({
        where: { id: downtime.id },
        data: { endedAt: downtime.endedAt }
      });
    }

    if (operationSnapshot) {
      await prisma.workOrderOperation.update({
        where: { id: operationSnapshot.id },
        data: {
          status: operationSnapshot.status,
          startedAt: operationSnapshot.startedAt,
          completedAt: operationSnapshot.completedAt
        }
      });
    }

    if (workOrderSnapshot) {
      await prisma.workOrder.update({
        where: { id: workOrderSnapshot.id },
        data: {
          status: workOrderSnapshot.status,
          actualStartDate: workOrderSnapshot.actualStartDate,
          actualEndDate: workOrderSnapshot.actualEndDate
        }
      });
    }

    if (machineSnapshot) {
      await prisma.machine.update({
        where: { id: machineSnapshot.id },
        data: { status: machineSnapshot.status }
      });
    }

    await prisma.$disconnect();
  });
