import bcrypt from "bcryptjs";
import { prisma } from "../src/config/db.js";
import { createProductionLog, createScrapActionForProductionLog } from "../src/modules/production-logs/productionLog.service.js";
import { completeOperation, startOperation } from "../src/modules/work-order-operations/workOrderOperation.service.js";
import { recordFinishedGoodsReceipt } from "../src/modules/inventory/inventory.service.js";

const PREFIX = "E2E-SCRAP-FLOW";
const sourceOrderNo = `${PREFIX}-SOURCE`;
const reworkOrderNo = `${PREFIX}-REWORK-SOURCE`;
const conditionalOrderNo = `${PREFIX}-CONDITIONAL`;
const passwordHash = await bcrypt.hash("Admin123!", 10);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function cleanupWorkOrders() {
  const workOrders = await prisma.workOrder.findMany({
    where: {
      orderNo: {
        startsWith: PREFIX
      }
    },
    include: {
      operations: true,
      productionLogs: true,
      productionAlerts: true
    }
  });

  const workOrderIds = workOrders.map((workOrder) => workOrder.id);
  const operationIds = workOrders.flatMap((workOrder) => workOrder.operations.map((operation) => operation.id));
  const productionLogIds = workOrders.flatMap((workOrder) => workOrder.productionLogs.map((log) => log.id));
  const alertIds = workOrders.flatMap((workOrder) => workOrder.productionAlerts.map((alert) => alert.id));

  await prisma.notification.deleteMany({
    where: {
      OR: [
        { message: { contains: PREFIX } },
        { entityId: { in: [...workOrderIds, ...operationIds, ...productionLogIds, ...alertIds] } }
      ]
    }
  });
  await prisma.operationMessage.deleteMany({ where: { workOrderOperationId: { in: operationIds } } });
  await prisma.productionAlertEvent.deleteMany({ where: { alertId: { in: alertIds } } });
  await prisma.productionAlert.deleteMany({ where: { workOrderId: { in: workOrderIds } } });
  await prisma.productionLogAttachment.deleteMany({ where: { productionLogId: { in: productionLogIds } } });
  await prisma.stockMovement.deleteMany({ where: { referenceId: { in: workOrderIds } } });
  await prisma.productionLog.deleteMany({
    where: {
      OR: [{ workOrderId: { in: workOrderIds } }, { scrapActionWorkOrderId: { in: workOrderIds } }]
    }
  });
  await prisma.qualityCheck.deleteMany({ where: { workOrderId: { in: workOrderIds } } });
  await prisma.operationDowntime.deleteMany({ where: { workOrderId: { in: workOrderIds } } });
  await prisma.workOrderOperation.deleteMany({ where: { workOrderId: { in: workOrderIds } } });
  await prisma.workOrder.deleteMany({ where: { id: { in: workOrderIds } } });
  await prisma.auditLog.deleteMany({ where: { summary: { contains: PREFIX } } });
}

async function ensureFactoryFixture() {
  const admin = await prisma.user.upsert({
    where: { email: "phase4.scrap.admin@meslite.local" },
    update: { isActive: true, role: "ADMIN" },
    create: {
      name: "Phase 4 Scrap Admin",
      email: "phase4.scrap.admin@meslite.local",
      passwordHash,
      role: "ADMIN"
    }
  });

  const operators = await Promise.all(
    [
      ["press", "Pres Operatörü"],
      ["drill", "Delik Delme Operatörü"],
      ["assembly", "Montaj Operatörü"]
    ].map(([code, name]) =>
      prisma.user.upsert({
        where: { email: `phase4.scrap.${code}@meslite.local` },
        update: { isActive: true, role: "OPERATOR" },
        create: {
          name,
          email: `phase4.scrap.${code}@meslite.local`,
          passwordHash,
          role: "OPERATOR"
        }
      })
    )
  );

  const line = await prisma.productionLine.upsert({
    where: { name: `${PREFIX} Hattı` },
    update: { isActive: true },
    create: { name: `${PREFIX} Hattı`, description: "Fire/telafi kabul testi hattı" }
  });

  const machines = await Promise.all(
    [
      ["E2E-SCRAP-PRS", "Servo Pres Test"],
      ["E2E-SCRAP-DRL", "Delik Delme Test"],
      ["E2E-SCRAP-MNT", "Montaj Test"]
    ].map(([code, name]) =>
      prisma.machine.upsert({
        where: { code },
        update: { isActive: true, productionLineId: line.id },
        create: {
          code,
          name,
          productionLineId: line.id
        }
      })
    )
  );

  await Promise.all(
    operators.flatMap((operator) =>
      machines.map((machine) =>
        prisma.operatorMachineSkill.upsert({
          where: {
            operatorId_machineId: {
              operatorId: operator.id,
              machineId: machine.id
            }
          },
          update: { isActive: true, level: "CERTIFIED" },
          create: {
            operatorId: operator.id,
            machineId: machine.id,
            level: "CERTIFIED",
            note: "Acceptance fixture"
          }
        })
      )
    )
  );

  const product = await prisma.product.upsert({
    where: { code: "E2E-SCRAP-PRODUCT" },
    update: { isActive: true },
    create: {
      code: "E2E-SCRAP-PRODUCT",
      name: "Fire Telafi Test Ürünü",
      unit: "adet",
      targetCycleTime: 60
    }
  });

  const componentProduct = await prisma.product.upsert({
    where: { code: "E2E-SCRAP-COMPONENT" },
    update: { isActive: true },
    create: { code: "E2E-SCRAP-COMPONENT", name: "Fire Telafi Test Bileşeni", unit: "adet" }
  });

  await prisma.stockItem.upsert({
    where: { productId: product.id },
    create: { productId: product.id, quantityOnHand: 0, reservedQuantity: 0 },
    update: { quantityOnHand: 0, reservedQuantity: 0 }
  });

  await prisma.stockItem.upsert({
    where: { productId: componentProduct.id },
    create: { productId: componentProduct.id, quantityOnHand: 1000, reservedQuantity: 0 },
    update: { quantityOnHand: 1000, reservedQuantity: 0 }
  });

  await prisma.productBomItem.upsert({
    where: { productId_componentProductId: { productId: product.id, componentProductId: componentProduct.id } },
    create: { productId: product.id, componentProductId: componentProduct.id, quantity: 2, unit: "adet" },
    update: { quantity: 2, unit: "adet", wastePercent: 0 }
  });

  const route = await prisma.productRoute.upsert({
    where: {
      productId_name: {
        productId: product.id,
        name: `${PREFIX} Rotası`
      }
    },
    update: { isActive: true },
    create: {
      productId: product.id,
      name: `${PREFIX} Rotası`,
      description: "Pres, delik delme ve montaj akışı"
    }
  });

  const operationSpecs = [
    [1, "Presleme", machines[0].id, 30],
    [2, "Delik Delme", machines[1].id, 25],
    [3, "Montaj", machines[2].id, 35]
  ];

  const routeOperations = [];
  for (const [sequenceNo, operationName, defaultMachineId, estimatedMinutes] of operationSpecs) {
    routeOperations.push(
      await prisma.routeOperation.upsert({
        where: {
          routeId_sequenceNo: {
            routeId: route.id,
            sequenceNo
          }
        },
        update: { operationName, defaultMachineId, estimatedMinutes },
        create: {
          routeId: route.id,
          sequenceNo,
          operationName,
          defaultMachineId,
          estimatedMinutes
        }
      })
    );
  }

  return { admin, operators, machines, product, componentProduct, route, routeOperations };
}

async function createRoutedWorkOrder({ orderNo, admin, product, route, routeOperations, machines, operators, plannedQuantity }) {
  return prisma.workOrder.create({
    data: {
      orderNo,
      productId: product.id,
      routeId: route.id,
      plannedQuantity,
      status: "IN_PROGRESS",
      actualStartDate: new Date(),
      createdById: admin.id,
      operations: {
        create: routeOperations.map((routeOperation, index) => ({
          routeOperationId: routeOperation.id,
          sequenceNo: routeOperation.sequenceNo,
          operationName: routeOperation.operationName,
          machineId: machines[index].id,
          assignedOperatorId: operators[index].id,
          status: index === 0 ? "IN_PROGRESS" : "WAITING",
          startedAt: index === 0 ? new Date() : null
        }))
      }
    },
    include: {
      operations: {
        orderBy: { sequenceNo: "asc" }
      }
    }
  });
}

async function getWorkOrder(orderNo) {
  return prisma.workOrder.findUnique({
    where: { orderNo },
    include: {
      operations: {
        include: {
          assignedOperator: true,
          machine: true
        },
        orderBy: { sequenceNo: "asc" }
      },
      productionLogs: {
        orderBy: { createdAt: "asc" }
      }
    }
  });
}

async function logAndCompleteOperation({ operator, workOrder, operation, producedQuantity, scrapQuantity = 0, scrapDisposition, scrapResolutionQuantity = 0 }) {
  await createProductionLog(operator, {
    workOrderId: workOrder.id,
    workOrderOperationId: operation.id,
    machineId: operation.machineId,
    producedQuantity,
    scrapQuantity,
    scrapReason: scrapQuantity > 0 ? "PROCESS_DEVIATION" : undefined,
    scrapDisposition,
    scrapResolutionQuantity,
    scrapDispositionNote: scrapQuantity > 0 ? `${PREFIX} kabul testi fire kararı` : undefined,
    note: `${PREFIX} kabul testi üretim kaydı`
  });

  return completeOperation(operator, operation.id);
}

async function runRoutedProductionToCompletion({ orderNo, operators, perOperationProducedQuantity, startIndex = 0 }) {
  let workOrder = await getWorkOrder(orderNo);

  for (let index = startIndex; index < workOrder.operations.length; index += 1) {
    workOrder = await getWorkOrder(orderNo);
    const operation = workOrder.operations[index];
    const operator = operators[index];

    if (operation.status === "READY") {
      await startOperation(operator, operation.id);
      workOrder = await getWorkOrder(orderNo);
    }

    const activeOperation = workOrder.operations[index];
    await logAndCompleteOperation({
      operator,
      workOrder,
      operation: activeOperation,
      producedQuantity: perOperationProducedQuantity
    });
  }

  return getWorkOrder(orderNo);
}

async function assertReplacementFlow(fixture) {
  const source = await createRoutedWorkOrder({
    ...fixture,
    orderNo: sourceOrderNo,
    plannedQuantity: 100
  });
  const [pressOperator] = fixture.operators;

  await logAndCompleteOperation({
    operator: pressOperator,
    workOrder: source,
    operation: source.operations[0],
    producedQuantity: 90,
    scrapQuantity: 10,
    scrapDisposition: "REPRODUCE",
    scrapResolutionQuantity: 10
  });

  const pendingReplacementLog = await prisma.productionLog.findFirst({
    where: { workOrderId: source.id, scrapQuantity: 10 },
    orderBy: { createdAt: "desc" }
  });
  await createScrapActionForProductionLog(fixture.admin, pendingReplacementLog.id, {
    scrapDisposition: "REPRODUCE",
    scrapResolutionQuantity: 10,
    scrapDispositionNote: `${PREFIX} telafi kararı`
  });

  const sourceAfterScrap = await getWorkOrder(sourceOrderNo);
  const scrapLog = sourceAfterScrap.productionLogs.find((log) => log.scrapQuantity === 10);
  assert(scrapLog?.scrapActionStatus === "CREATED", "Fire kaydı telafi iş emri oluşturmalı");
  assert(scrapLog.scrapActionWorkOrderNo?.startsWith(`${sourceOrderNo}-TELAFI-`), "Telafi iş emri numarası kaynak iş emrine bağlı olmalı");
  const replacementScrapLot = await prisma.scrapLot.findUnique({ where: { productionLogId: scrapLog.id } });
  assert(replacementScrapLot?.status === "REPRODUCTION_PLANNED", "Yeniden üretim kararı fire lotunu telafi planlandı durumuna almalı");
  assert(replacementScrapLot.location === "KARANTINA", "Telafi bekleyen fiziksel fire karantinada kalmalı");

  const actionOrder = await getWorkOrder(scrapLog.scrapActionWorkOrderNo);
  assert(actionOrder, "Telafi iş emri bulunmalı");
  assert(actionOrder.plannedQuantity === 10, "Telafi iş emri fire kadar planlanmalı");
  const reservedComponentStock = await prisma.stockItem.findUnique({ where: { productId: fixture.componentProduct.id } });
  assert(Number(reservedComponentStock.quantityOnHand) === 1000, "Telafi emri oluşurken stok henüz tüketilmemeli");
  assert(Number(reservedComponentStock.reservedQuantity) === 20, "Telafi emri BOM ihtiyacı kadar stok rezerve etmeli");
  assert(actionOrder.operations.length === source.operations.length, "Telafi iş emri tüm rotayı kopyalamalı");
  actionOrder.operations.forEach((operation, index) => {
    assert(operation.machineId === source.operations[index].machineId, "Telafi operasyon makinesi kaynak operasyonla aynı olmalı");
    assert(operation.assignedOperatorId === source.operations[index].assignedOperatorId, "Telafi operasyon operatörü kaynak operatörle aynı olmalı");
  });

  const firstOperatorNotification = await prisma.notification.findFirst({
    where: {
      recipientId: pressOperator.id,
      type: "SCRAP_REPRODUCTION_ASSIGNED",
      entityId: actionOrder.id
    }
  });
  assert(firstOperatorNotification, "İlk telafi operatörüne bildirim gitmeli");

  await runRoutedProductionToCompletion({
    orderNo: sourceOrderNo,
    operators: fixture.operators,
    perOperationProducedQuantity: 90,
    startIndex: 1
  });

  const sourceBeforeActionCompletion = await getWorkOrder(sourceOrderNo);
  assert(sourceBeforeActionCompletion.status !== "COMPLETED", "Ana iş emri telafi bitmeden tamamlanmamalı");
  assert(sourceBeforeActionCompletion.producedQuantity === 90, "Ana iş emri final üretimi 90 sağlam adet olmalı");

  const completedActionOrder = await runRoutedProductionToCompletion({
    orderNo: actionOrder.orderNo,
    operators: fixture.operators,
    perOperationProducedQuantity: 10
  });
  assert(completedActionOrder.status === "COMPLETED", "Telafi iş emri tamamlanmalı");
  assert(completedActionOrder.producedQuantity === 10, "Telafi final üretimi 10 adet olmalı");
  const consumedComponentStock = await prisma.stockItem.findUnique({ where: { productId: fixture.componentProduct.id } });
  assert(Number(consumedComponentStock.quantityOnHand) === 980, "Telafi başladığında BOM malzemesi stoktan tüketilmeli");
  assert(Number(consumedComponentStock.reservedQuantity) === 0, "Tüketilen telafi rezervasyonu kapatılmalı");

  const completedSource = await getWorkOrder(sourceOrderNo);
  assert(completedSource.status === "COMPLETED", "Ana iş emri telafi üretimi tamamlanınca kapanmalı");
  const finishedGoodsStock = await prisma.stockItem.findUnique({ where: { productId: fixture.product.id } });
  assert(Number(finishedGoodsStock.quantityOnHand) === 100, "Ana iş emri tamamlanınca toplam 100 mamul stoğa girmeli");
  const sourceReceipts = await prisma.stockMovement.findMany({
    where: { productId: fixture.product.id, type: "PRODUCTION_IN", referenceId: completedSource.id }
  });
  const actionReceipts = await prisma.stockMovement.findMany({
    where: { productId: fixture.product.id, type: "PRODUCTION_IN", referenceId: completedActionOrder.id }
  });
  assert(sourceReceipts.length === 1, "Ana iş emri için tek mamul stok hareketi oluşmalı");
  assert(actionReceipts.length === 0, "Telafi iş emri ayrı mamul girişi oluşturup stoğu çift saymamalı");
  await prisma.$transaction((tx) => recordFinishedGoodsReceipt(tx, completedSource, fixture.admin.id));
  const stockAfterIdempotentRetry = await prisma.stockItem.findUnique({ where: { productId: fixture.product.id } });
  assert(Number(stockAfterIdempotentRetry.quantityOnHand) === 100, "Aynı kapanış tekrar işlense bile mamul stoku artmamalı");

  const closeAudit = await prisma.auditLog.findFirst({
    where: {
      action: "WORK_ORDER_COMPLETED_BY_SCRAP_COMPENSATION",
      entityId: completedSource.id
    }
  });
  assert(closeAudit, "Ana iş emrinin telafi ile kapanışı audit log'a yazılmalı");
}

async function assertReworkAndConditionalFlows(fixture) {
  const reworkSource = await createRoutedWorkOrder({
    ...fixture,
    orderNo: reworkOrderNo,
    plannedQuantity: 50
  });
  const [pressOperator] = fixture.operators;

  await createProductionLog(pressOperator, {
    workOrderId: reworkSource.id,
    workOrderOperationId: reworkSource.operations[0].id,
    machineId: reworkSource.operations[0].machineId,
    producedQuantity: 45,
    scrapQuantity: 5,
    scrapReason: "QUALITY_REJECT",
    scrapDisposition: "REWORK",
    scrapResolutionQuantity: 5,
    scrapDispositionNote: `${PREFIX} yeniden işlem testi`,
    note: `${PREFIX} rework fire kaydı`
  });

  let reworkLog = await prisma.productionLog.findFirst({
    where: {
      workOrderId: reworkSource.id,
      scrapQuantity: 5
    },
    orderBy: { createdAt: "desc" }
  });
  await createScrapActionForProductionLog(fixture.admin, reworkLog.id, {
    scrapDisposition: "REWORK",
    scrapResolutionQuantity: 5,
    scrapDispositionNote: `${PREFIX} yeniden işlem kararı`
  });
  reworkLog = await prisma.productionLog.findUnique({ where: { id: reworkLog.id } });
  assert(reworkLog?.scrapActionStatus === "CREATED", "REWORK kararı yeniden işlem iş emri oluşturmalı");
  const reworkScrapLot = await prisma.scrapLot.findUnique({ where: { productionLogId: reworkLog.id } });
  assert(reworkScrapLot?.status === "REWORK_PLANNED", "REWORK kararı fire lotunu yeniden işlem durumuna almalı");

  const reworkAction = await getWorkOrder(reworkLog.scrapActionWorkOrderNo);
  assert(reworkAction.operations.length === 1, "Yeniden işlem iş emri yalnızca hedef operasyonu içermeli");
  assert(reworkAction.operations[0].operationName.includes("Yeniden"), "Yeniden işlem operasyonu açık isimle görünmeli");
  assert(reworkAction.operations[0].assignedOperatorId === reworkSource.operations[0].assignedOperatorId, "Rework operatörü kaynak operasyon operatörü olmalı");
  const stockAfterReworkDecision = await prisma.stockItem.findUnique({ where: { productId: fixture.componentProduct.id } });
  assert(Number(stockAfterReworkDecision.quantityOnHand) === 980, "Rework mevcut parçayı kullandığı için BOM stokunu tekrar tüketmemeli");
  assert(Number(stockAfterReworkDecision.reservedQuantity) === 0, "Rework için ana BOM rezervasyonu oluşmamalı");

  const conditionalSource = await createRoutedWorkOrder({
    ...fixture,
    orderNo: conditionalOrderNo,
    plannedQuantity: 40
  });

  await createProductionLog(pressOperator, {
    workOrderId: conditionalSource.id,
    workOrderOperationId: conditionalSource.operations[0].id,
    machineId: conditionalSource.operations[0].machineId,
    producedQuantity: 35,
    scrapQuantity: 5,
    scrapReason: "MATERIAL_DEFECT",
    scrapDisposition: "CONDITIONAL_ACCEPT",
    scrapResolutionQuantity: 0,
    scrapDispositionNote: `${PREFIX} şartlı kabul testi`,
    note: `${PREFIX} conditional fire kaydı`
  });

  let conditionalLog = await prisma.productionLog.findFirst({
    where: {
      workOrderId: conditionalSource.id,
      scrapQuantity: 5
    },
    orderBy: { createdAt: "desc" }
  });
  await createScrapActionForProductionLog(fixture.admin, conditionalLog.id, {
    scrapDisposition: "CONDITIONAL_ACCEPT",
    scrapDispositionNote: `${PREFIX} şartlı kabul kararı`
  });
  conditionalLog = await prisma.productionLog.findUnique({ where: { id: conditionalLog.id } });
  assert(conditionalLog?.scrapActionStatus === "NOT_REQUIRED", "Şartlı kabul ek iş emri oluşturmamalı");
  assert(!conditionalLog.scrapActionWorkOrderId, "Şartlı kabulde bağlı telafi iş emri olmamalı");
  const conditionalScrapLot = await prisma.scrapLot.findUnique({ where: { productionLogId: conditionalLog.id } });
  assert(conditionalScrapLot?.status === "CONDITIONALLY_ACCEPTED", "Şartlı kabul fire lotunu serbest bırakmalı");
  assert(conditionalScrapLot.location === "SERBEST", "Şartlı kabul edilen lot karantinadan çıkmalı");
}

async function main() {
  await cleanupWorkOrders();
  const fixture = await ensureFactoryFixture();

  await assertReplacementFlow(fixture);
  await assertReworkAndConditionalFlows(fixture);

  console.log({
    acceptance: "ok",
    checkedRules: [
      "fire disposition creates linked compensation work order",
      "compensation work order copies route machines and operators",
      "first compensation operator receives notification",
      "source work order stays open until its main flow and linked compensation are complete",
      "completed compensation closes the source work order when planned quantity is covered",
      "rework disposition creates a single-operation rework order",
      "conditional acceptance does not create an extra work order",
      "scrap lots track quarantine, rework, reproduction and conditional acceptance states",
      "replacement production reserves BOM stock and consumes it when production starts",
      "completed source order creates one idempotent finished-goods receipt without double-counting replacement output"
    ]
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanupWorkOrders();
    await prisma.$disconnect();
  });
