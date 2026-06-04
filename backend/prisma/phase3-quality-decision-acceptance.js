import { prisma } from "../src/config/db.js";
import { createQualityCheck } from "../src/modules/quality-checks/qualityCheck.service.js";
import { decideQualityAction } from "../src/modules/production-alerts/productionAlert.service.js";

let createdQualityCheckId = null;
let createdAlertId = null;
let targetOperationSnapshot = null;
let workOrderSnapshot = null;
const decisionNote = "Acceptance test: kalite sorunu icin hedef operasyon yeniden islenecek";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const [qualityStaff, productionManager, workOrder] = await Promise.all([
    prisma.user.findUnique({ where: { email: "quality@meslite.local" } }),
    prisma.user.findUnique({ where: { email: "manager@meslite.local" } }),
    prisma.workOrder.findUnique({
      where: { orderNo: "E2E-DEMO-QUALITY" },
      include: {
        operations: {
          include: {
            assignedOperator: true
          },
          orderBy: { sequenceNo: "asc" }
        }
      }
    })
  ]);

  assert(qualityStaff, "Quality staff user is missing");
  assert(productionManager, "Production manager user is missing");
  assert(workOrder, "E2E-DEMO-QUALITY work order is missing");

  workOrderSnapshot = {
    id: workOrder.id,
    status: workOrder.status,
    actualEndDate: workOrder.actualEndDate
  };

  const qualityOperation = workOrder.operations.find((operation) => operation.operationName.toLocaleLowerCase("tr-TR").includes("kalite"));
  const targetOperation = workOrder.operations.find((operation) => operation.assignedOperatorId);

  assert(qualityOperation, "Quality operation is missing");
  assert(targetOperation, "A rework target operation with assigned operator is required");

  targetOperationSnapshot = {
    id: targetOperation.id,
    status: targetOperation.status,
    completedAt: targetOperation.completedAt
  };

  await prisma.workOrder.update({
    where: { id: workOrder.id },
    data: {
      status: "IN_PROGRESS",
      actualEndDate: null
    }
  });

  const qualityCheck = await createQualityCheck(qualityStaff, {
    workOrderId: workOrder.id,
    workOrderOperationId: qualityOperation.id,
    status: "PARTIAL",
    defectQuantity: 1,
    defectReason: "Acceptance test geri isleme",
    note: "Kalite karar testi"
  });
  createdQualityCheckId = qualityCheck.id;

  const alert = await prisma.productionAlert.findFirst({
    where: {
      workOrderId: workOrder.id,
      title: { startsWith: "Kalite uygunsuzlugu" },
      message: { contains: "Acceptance test geri isleme" }
    },
    orderBy: { createdAt: "desc" }
  });

  assert(alert, "Quality check must create a production alert");
  createdAlertId = alert.id;

  const decidedAlert = await decideQualityAction(productionManager, alert.id, {
    decision: "REWORK_OPERATION",
    reworkOperationId: targetOperation.id,
    note: decisionNote
  });

  const [updatedTargetOperation, notification, actionMessage] = await Promise.all([
    prisma.workOrderOperation.findUnique({ where: { id: targetOperation.id } }),
    prisma.notification.findFirst({
      where: {
        recipientId: targetOperation.assignedOperatorId,
        type: "QUALITY_REWORK_ASSIGNED",
        entityId: targetOperation.id
      },
      orderBy: { createdAt: "desc" }
    }),
    prisma.operationMessage.findFirst({
      where: {
        workOrderOperationId: targetOperation.id,
        severity: "QUALITY_ALERT",
        message: { contains: decisionNote }
      }
    })
  ]);

  assert(decidedAlert.qualityDecision === "REWORK_OPERATION", "Alert must store quality action decision");
  assert(decidedAlert.reworkOperationId === targetOperation.id, "Alert must store rework operation");
  assert(decidedAlert.status === "IN_REVIEW", "Rework decision must keep alert in review");
  assert(["READY", "IN_PROGRESS", "PAUSED"].includes(updatedTargetOperation.status), "Target operation must become actionable");
  assert(notification, "Target operator must receive rework notification");
  assert(actionMessage, "Target operation must receive quality action message");

  console.log({
    acceptance: "ok",
    checkedRules: [
      "quality alert can receive a management decision",
      "rework decision points to a concrete operation",
      "target operation becomes actionable",
      "target operator receives notification",
      "operation history receives quality action message"
    ]
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (createdAlertId) {
      await prisma.notification.deleteMany({ where: { entityType: "ProductionAlert", entityId: createdAlertId } });
      await prisma.notification.deleteMany({ where: { type: "QUALITY_REWORK_ASSIGNED", metadata: { path: ["alertId"], equals: createdAlertId } } });
      await prisma.productionAlertEvent.deleteMany({ where: { alertId: createdAlertId } });
      await prisma.productionAlert.deleteMany({ where: { id: createdAlertId } });
    }

    await prisma.operationMessage.deleteMany({ where: { message: { contains: decisionNote } } });

    if (createdQualityCheckId) {
      await prisma.qualityCheck.deleteMany({ where: { id: createdQualityCheckId } });
    }

    if (targetOperationSnapshot) {
      await prisma.workOrderOperation.update({
        where: { id: targetOperationSnapshot.id },
        data: {
          status: targetOperationSnapshot.status,
          completedAt: targetOperationSnapshot.completedAt
        }
      });
    }

    if (workOrderSnapshot) {
      await prisma.workOrder.update({
        where: { id: workOrderSnapshot.id },
        data: {
          status: workOrderSnapshot.status,
          actualEndDate: workOrderSnapshot.actualEndDate
        }
      });
    }

    await prisma.$disconnect();
  });
