import { prisma } from "../src/config/db.js";
import { createQualityCheck } from "../src/modules/quality-checks/qualityCheck.service.js";

let createdQualityCheckId = null;
let createdAlertId = null;

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
          orderBy: { sequenceNo: "asc" }
        }
      }
    })
  ]);

  assert(qualityStaff, "Quality staff user is missing");
  assert(productionManager, "Production manager user is missing");
  assert(workOrder, "E2E-DEMO-QUALITY work order is missing");

  const qualityOperation = workOrder.operations.find((operation) => operation.operationName === "Kalite Kontrol");
  assert(qualityOperation, "Quality operation is missing");

  const alertCountBefore = await prisma.productionAlert.count({
    where: {
      workOrderId: workOrder.id,
      title: { startsWith: "Kalite uygunsuzlugu" }
    }
  });
  const notificationCountBefore = await prisma.notification.count({
    where: {
      type: "QUALITY_NONCONFORMITY",
      entityType: "ProductionAlert"
    }
  });

  const qualityCheck = await createQualityCheck(qualityStaff, {
    workOrderId: workOrder.id,
    workOrderOperationId: qualityOperation.id,
    status: "PARTIAL",
    defectQuantity: 1,
    defectReason: "Acceptance test cizik",
    note: "Kalite aksiyon testi"
  });
  createdQualityCheckId = qualityCheck.id;

  assert(qualityCheck.traceability, "Created quality check must return traceability");

  const alert = await prisma.productionAlert.findFirst({
    where: {
      workOrderId: workOrder.id,
      title: { startsWith: "Kalite uygunsuzlugu" },
      message: { contains: "Acceptance test cizik" }
    },
    include: {
      assignedTo: true,
      events: true
    },
    orderBy: { createdAt: "desc" }
  });

  const alertCountAfter = await prisma.productionAlert.count({
    where: {
      workOrderId: workOrder.id,
      title: { startsWith: "Kalite uygunsuzlugu" }
    }
  });
  const notificationCountAfter = await prisma.notification.count({
    where: {
      type: "QUALITY_NONCONFORMITY",
      entityType: "ProductionAlert"
    }
  });

  assert(alert, "Quality nonconformity must create a production alert");
  createdAlertId = alert.id;
  assert(alertCountAfter === alertCountBefore + 1, "Quality action alert count must increase by one");
  assert(alert.assignedToId === productionManager.id, "Quality action must be assigned to production manager");
  assert(alert.severity === "WARNING", `Partial quality action must be warning, found ${alert.severity}`);
  assert(alert.events.some((event) => event.type === "CREATED"), "Quality action alert must have created event");
  assert(notificationCountAfter > notificationCountBefore, "Quality action must create notifications");

  console.log({
    acceptance: "ok",
    checkedRules: [
      "quality nonconformity creates alert",
      "quality action assigned to production manager",
      "quality action notification",
      "quality action event history"
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
      await prisma.productionAlertEvent.deleteMany({ where: { alertId: createdAlertId } });
      await prisma.productionAlert.deleteMany({ where: { id: createdAlertId } });
    }

    if (createdQualityCheckId) {
      await prisma.qualityCheck.deleteMany({ where: { id: createdQualityCheckId } });
    }

    await prisma.$disconnect();
  });
