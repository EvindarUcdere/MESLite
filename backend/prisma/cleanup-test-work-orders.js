import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const defaultPrefixes = ["MOB-TEST-", "MOB-DEMO-", "denem", "Deneme"];
const prefixes = process.argv.slice(2).length ? process.argv.slice(2) : defaultPrefixes;

async function deleteWorkOrdersByPrefixes(orderPrefixes) {
  const workOrders = await prisma.workOrder.findMany({
    where: {
      OR: orderPrefixes.map((prefix) => ({
        orderNo: { startsWith: prefix }
      }))
    },
    select: { id: true, orderNo: true }
  });

  const workOrderIds = workOrders.map((workOrder) => workOrder.id);

  if (!workOrderIds.length) {
    return {
      deletedWorkOrders: [],
      counts: {
        notifications: 0,
        alertEvents: 0,
        alerts: 0,
        attachments: 0,
        productionLogs: 0,
        qualityChecks: 0,
        messages: 0,
        downtimes: 0,
        operations: 0,
        workOrders: 0
      }
    };
  }

  const productionLogs = await prisma.productionLog.findMany({
    where: { workOrderId: { in: workOrderIds } },
    select: { id: true }
  });
  const productionLogIds = productionLogs.map((log) => log.id);

  const operations = await prisma.workOrderOperation.findMany({
    where: { workOrderId: { in: workOrderIds } },
    select: { id: true }
  });
  const operationIds = operations.map((operation) => operation.id);

  const alerts = await prisma.productionAlert.findMany({
    where: { workOrderId: { in: workOrderIds } },
    select: { id: true }
  });
  const alertIds = alerts.map((alert) => alert.id);

  const notifications = await prisma.notification.deleteMany({
    where: {
      OR: [
        { entityId: { in: workOrderIds } },
        { entityId: { in: operationIds } },
        { entityId: { in: productionLogIds } },
        { entityId: { in: alertIds } }
      ]
    }
  });
  const alertEvents = await prisma.productionAlertEvent.deleteMany({ where: { alertId: { in: alertIds } } });
  const deletedAlerts = await prisma.productionAlert.deleteMany({ where: { id: { in: alertIds } } });
  const attachments = await prisma.productionLogAttachment.deleteMany({ where: { productionLogId: { in: productionLogIds } } });
  const productionLogDelete = await prisma.productionLog.deleteMany({ where: { id: { in: productionLogIds } } });
  const qualityChecks = await prisma.qualityCheck.deleteMany({ where: { workOrderId: { in: workOrderIds } } });
  const messages = await prisma.operationMessage.deleteMany({ where: { workOrderOperationId: { in: operationIds } } });
  const downtimes = await prisma.operationDowntime.deleteMany({ where: { workOrderId: { in: workOrderIds } } });
  const operationDelete = await prisma.workOrderOperation.deleteMany({ where: { id: { in: operationIds } } });
  const workOrderDelete = await prisma.workOrder.deleteMany({ where: { id: { in: workOrderIds } } });

  return {
    deletedWorkOrders: workOrders.map((workOrder) => workOrder.orderNo),
    counts: {
      notifications: notifications.count,
      alertEvents: alertEvents.count,
      alerts: deletedAlerts.count,
      attachments: attachments.count,
      productionLogs: productionLogDelete.count,
      qualityChecks: qualityChecks.count,
      messages: messages.count,
      downtimes: downtimes.count,
      operations: operationDelete.count,
      workOrders: workOrderDelete.count
    }
  };
}

async function main() {
  const result = await deleteWorkOrdersByPrefixes(prefixes);

  console.log(JSON.stringify({
    prefixes,
    ...result
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
