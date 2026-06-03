import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const password = "Admin123!";
const demoOrderPrefix = "E2E-DEMO-";

async function upsertUser({ email, name, role }) {
  const passwordHash = await bcrypt.hash(password, 10);

  return prisma.user.upsert({
    where: { email },
    update: { name, role, isActive: true },
    create: { email, name, role, passwordHash }
  });
}

async function resetDemoWorkOrders() {
  const demoWorkOrders = await prisma.workOrder.findMany({
    where: { orderNo: { startsWith: demoOrderPrefix } },
    select: { id: true }
  });
  const workOrderIds = demoWorkOrders.map((workOrder) => workOrder.id);

  if (!workOrderIds.length) {
    return;
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

  await prisma.notification.deleteMany({
    where: {
      entityId: {
        in: [...workOrderIds, ...operationIds, ...productionLogIds, ...alertIds]
      }
    }
  });
  await prisma.productionAlertEvent.deleteMany({ where: { alertId: { in: alertIds } } });
  await prisma.productionAlert.deleteMany({ where: { id: { in: alertIds } } });
  await prisma.productionLogAttachment.deleteMany({ where: { productionLogId: { in: productionLogIds } } });
  await prisma.productionLog.deleteMany({ where: { id: { in: productionLogIds } } });
  await prisma.qualityCheck.deleteMany({ where: { workOrderId: { in: workOrderIds } } });
  await prisma.operationMessage.deleteMany({ where: { workOrderOperation: { workOrderId: { in: workOrderIds } } } });
  await prisma.operationDowntime.deleteMany({ where: { workOrderId: { in: workOrderIds } } });
  await prisma.workOrderOperation.deleteMany({ where: { workOrderId: { in: workOrderIds } } });
  await prisma.workOrder.deleteMany({ where: { id: { in: workOrderIds } } });
}

async function createRoute({ product, machines }) {
  const route = await prisma.productRoute.upsert({
    where: {
      productId_name: {
        productId: product.id,
        name: "E2E Demo Rota"
      }
    },
    update: {
      isActive: true,
      description: "Kesim, montaj ve kalite adimlariyla portfoy demo rotasi"
    },
    create: {
      productId: product.id,
      name: "E2E Demo Rota",
      description: "Kesim, montaj ve kalite adimlariyla portfoy demo rotasi"
    }
  });

  await prisma.routeOperation.deleteMany({ where: { routeId: route.id } });

  const routeOperations = await Promise.all([
    prisma.routeOperation.create({
      data: {
        routeId: route.id,
        operationName: "Kesim",
        sequenceNo: 1,
        defaultMachineId: machines.cutting.id,
        estimatedMinutes: 35
      }
    }),
    prisma.routeOperation.create({
      data: {
        routeId: route.id,
        operationName: "Montaj",
        sequenceNo: 2,
        defaultMachineId: machines.assembly.id,
        estimatedMinutes: 55
      }
    }),
    prisma.routeOperation.create({
      data: {
        routeId: route.id,
        operationName: "Kalite Kontrol",
        sequenceNo: 3,
        defaultMachineId: machines.quality.id,
        estimatedMinutes: 20,
        requiresQualityCheck: true
      }
    })
  ]);

  return { route, routeOperations };
}

async function createDemoWorkOrder({ admin, product, route, routeOperations, operators, machines, scenario }) {
  const workOrder = await prisma.workOrder.create({
    data: {
      orderNo: scenario.orderNo,
      productId: product.id,
      routeId: route.id,
      plannedQuantity: scenario.plannedQuantity,
      producedQuantity: scenario.producedQuantity,
      scrapQuantity: scenario.scrapQuantity,
      status: scenario.status,
      createdById: admin.id,
      actualStartDate: scenario.actualStartDate,
      actualEndDate: scenario.actualEndDate,
      operations: {
        create: scenario.operations.map((operation, index) => ({
          routeOperationId: routeOperations[index].id,
          machineId: operation.machineId,
          assignedOperatorId: operation.assignedOperatorId,
          sequenceNo: index + 1,
          operationName: operation.operationName,
          status: operation.status,
          producedQuantity: operation.producedQuantity,
          scrapQuantity: operation.scrapQuantity,
          startedAt: operation.startedAt,
          completedAt: operation.completedAt
        }))
      }
    },
    include: {
      operations: { orderBy: { sequenceNo: "asc" } }
    }
  });

  for (const log of scenario.logs) {
    const operation = workOrder.operations[log.sequenceNo - 1];
    await prisma.productionLog.create({
      data: {
        workOrderId: workOrder.id,
        workOrderOperationId: operation.id,
        operatorId: operation.assignedOperatorId,
        machineId: operation.machineId,
        producedQuantity: log.producedQuantity,
        scrapQuantity: log.scrapQuantity,
        scrapReason: log.scrapReason,
        shiftId: log.shiftId,
        note: log.note
      }
    });
  }

  for (const message of scenario.messages) {
    const operation = workOrder.operations[message.sequenceNo - 1];
    await prisma.operationMessage.create({
      data: {
        workOrderOperationId: operation.id,
        senderId: message.senderId,
        severity: message.severity,
        message: message.message
      }
    });
  }

  for (const downtimeEntry of scenario.downtimes ?? []) {
    const operation = workOrder.operations[downtimeEntry.sequenceNo - 1];
    await prisma.operationDowntime.create({
      data: {
        workOrderId: workOrder.id,
        workOrderOperationId: operation.id,
        machineId: operation.machineId,
        operatorId: operation.assignedOperatorId,
        shiftId: downtimeEntry.shiftId,
        reason: downtimeEntry.reason,
        note: downtimeEntry.note,
        startedAt: downtimeEntry.startedAt ?? new Date(),
        endedAt: downtimeEntry.endedAt
      }
    });
  }

  if (scenario.qualityCheck) {
    const operation = workOrder.operations[scenario.qualityCheck.sequenceNo - 1];
    await prisma.qualityCheck.create({
      data: {
        workOrderId: workOrder.id,
        workOrderOperationId: operation.id,
        checkedById: scenario.qualityCheck.checkedById,
        status: scenario.qualityCheck.status,
        defectQuantity: scenario.qualityCheck.defectQuantity,
        defectReason: scenario.qualityCheck.defectReason,
        note: scenario.qualityCheck.note
      }
    });
  }

  await prisma.machine.updateMany({
    where: { id: { in: [machines.cutting.id, machines.assembly.id, machines.quality.id] } },
    data: { status: "IDLE" }
  });

  return workOrder;
}

function minutesAgo(baseDate, minutes) {
  return new Date(baseDate.getTime() - minutes * 60000);
}

async function main() {
  await resetDemoWorkOrders();

  const [admin, manager, cuttingOperator, assemblyOperator, qualityOperator, qualityStaff] = await Promise.all([
    upsertUser({ email: "admin@meslite.local", name: "MES Lite Admin", role: "ADMIN" }),
    upsertUser({ email: "manager@meslite.local", name: "Üretim Yöneticisi", role: "PRODUCTION_MANAGER" }),
    upsertUser({ email: "operator@meslite.local", name: "Line Operator", role: "OPERATOR" }),
    upsertUser({ email: "assembly.operator@meslite.local", name: "Ali Kaya", role: "OPERATOR" }),
    upsertUser({ email: "quality.operator@meslite.local", name: "Zeynep Demir", role: "OPERATOR" }),
    upsertUser({ email: "quality@meslite.local", name: "Kalite Personeli", role: "QUALITY_STAFF" })
  ]);

  const line = await prisma.productionLine.upsert({
    where: { name: "E2E Demo Hattı" },
    update: { isActive: true, description: "Uctan uca Faz 2 test hatti" },
    create: { name: "E2E Demo Hattı", description: "Uctan uca Faz 2 test hatti" }
  });

  const [morningShift, eveningShift, nightShift] = await Promise.all([
    prisma.shift.upsert({
      where: { name: "E2E Sabah Vardiyasi" },
      update: { startTime: "06:00", endTime: "14:00", isActive: true },
      create: { name: "E2E Sabah Vardiyasi", startTime: "06:00", endTime: "14:00" }
    }),
    prisma.shift.upsert({
      where: { name: "E2E Aksam Vardiyasi" },
      update: { startTime: "14:00", endTime: "22:00", isActive: true },
      create: { name: "E2E Aksam Vardiyasi", startTime: "14:00", endTime: "22:00" }
    }),
    prisma.shift.upsert({
      where: { name: "E2E Gece Vardiyasi" },
      update: { startTime: "22:00", endTime: "06:00", isActive: true },
      create: { name: "E2E Gece Vardiyasi", startTime: "22:00", endTime: "06:00" }
    })
  ]);

  const [cuttingMachine, assemblyMachine, qualityMachine] = await Promise.all([
    prisma.machine.upsert({
      where: { code: "E2E-KSM-01" },
      update: { name: "Kesim Tezgahı", productionLineId: line.id, isActive: true },
      create: { code: "E2E-KSM-01", name: "Kesim Tezgahı", productionLineId: line.id }
    }),
    prisma.machine.upsert({
      where: { code: "E2E-MNT-01" },
      update: { name: "Montaj İstasyonu", productionLineId: line.id, isActive: true },
      create: { code: "E2E-MNT-01", name: "Montaj İstasyonu", productionLineId: line.id }
    }),
    prisma.machine.upsert({
      where: { code: "E2E-KLT-01" },
      update: { name: "Kalite Masası", productionLineId: line.id, isActive: true },
      create: { code: "E2E-KLT-01", name: "Kalite Masası", productionLineId: line.id }
    })
  ]);

  const product = await prisma.product.upsert({
    where: { code: "E2E-AMB-001" },
    update: { name: "Ambalajlı Final Demo", unit: "adet", isActive: true, targetCycleTime: 60 },
    create: { code: "E2E-AMB-001", name: "Ambalajlı Final Demo", unit: "adet", targetCycleTime: 60 }
  });

  const machines = {
    cutting: cuttingMachine,
    assembly: assemblyMachine,
    quality: qualityMachine
  };
  const shifts = {
    morning: morningShift,
    evening: eveningShift,
    night: nightShift
  };
  const { route, routeOperations } = await createRoute({ product, machines });
  const now = new Date();
  const runStart = minutesAgo(now, 110);
  const pauseStart = minutesAgo(now, 150);
  const qualityStart = minutesAgo(now, 260);
  const reopenStart = minutesAgo(now, 190);

  const scenarios = [
    {
      orderNo: `${demoOrderPrefix}RUN`,
      plannedQuantity: 120,
      producedQuantity: 0,
      scrapQuantity: 3,
      status: "IN_PROGRESS",
      actualStartDate: runStart,
      operations: [
        {
          operationName: "Kesim",
          machineId: cuttingMachine.id,
          assignedOperatorId: cuttingOperator.id,
          status: "COMPLETED",
          producedQuantity: 120,
          scrapQuantity: 1,
          startedAt: runStart,
          completedAt: minutesAgo(now, 70)
        },
        {
          operationName: "Montaj",
          machineId: assemblyMachine.id,
          assignedOperatorId: assemblyOperator.id,
          status: "IN_PROGRESS",
          producedQuantity: 60,
          scrapQuantity: 2,
          startedAt: minutesAgo(now, 65)
        },
        {
          operationName: "Kalite Kontrol",
          machineId: qualityMachine.id,
          assignedOperatorId: qualityOperator.id,
          status: "WAITING",
          producedQuantity: 0,
          scrapQuantity: 0
        }
      ],
      logs: [
        { sequenceNo: 1, shiftId: shifts.morning.id, producedQuantity: 120, scrapQuantity: 1, scrapReason: "MACHINE_SETUP", note: "Kesim tamamlandi, 1 parca ayar firesi." },
        { sequenceNo: 2, shiftId: shifts.evening.id, producedQuantity: 60, scrapQuantity: 2, scrapReason: "PROCESS_DEVIATION", note: "Montaj devam ediyor, sag kapakta cizik izlendi." }
      ],
      messages: [
        {
          sequenceNo: 2,
          senderId: assemblyOperator.id,
          severity: "WARNING",
          message: "Montajda sag kapak cizik riski var, kalite sonraki adimda dikkat etmeli."
        },
        {
          sequenceNo: 2,
          senderId: manager.id,
          severity: "INFO",
          message: "Montaj bittiginde kalite kontrol operatorune haber verin."
        }
      ],
      downtimes: [
        {
          sequenceNo: 2,
          shiftId: shifts.evening.id,
          reason: "QUALITY_WAITING",
          note: "Montaj sonrasi kalite onayi bekleniyor.",
          startedAt: minutesAgo(now, 30)
        }
      ]
    },
    {
      orderNo: `${demoOrderPrefix}PAUSE`,
      plannedQuantity: 80,
      producedQuantity: 0,
      scrapQuantity: 4,
      status: "PAUSED",
      actualStartDate: pauseStart,
      operations: [
        {
          operationName: "Kesim",
          machineId: cuttingMachine.id,
          assignedOperatorId: cuttingOperator.id,
          status: "COMPLETED",
          producedQuantity: 80,
          scrapQuantity: 0,
          startedAt: pauseStart,
          completedAt: minutesAgo(now, 105)
        },
        {
          operationName: "Montaj",
          machineId: assemblyMachine.id,
          assignedOperatorId: assemblyOperator.id,
          status: "PAUSED",
          producedQuantity: 25,
          scrapQuantity: 4,
          startedAt: minutesAgo(now, 100)
        },
        {
          operationName: "Kalite Kontrol",
          machineId: qualityMachine.id,
          assignedOperatorId: qualityOperator.id,
          status: "WAITING",
          producedQuantity: 0,
          scrapQuantity: 0
        }
      ],
      logs: [
        { sequenceNo: 1, shiftId: shifts.morning.id, producedQuantity: 80, scrapQuantity: 0, note: "Kesim sorunsuz tamamlandi." },
        { sequenceNo: 2, shiftId: shifts.night.id, producedQuantity: 25, scrapQuantity: 4, scrapReason: "MACHINE_SETUP", note: "Montaj fiksturu gevsedigi icin is durduruldu." }
      ],
      messages: [
        {
          sequenceNo: 2,
          senderId: assemblyOperator.id,
          severity: "STOPPAGE",
          message: "Fikstur baglantisi gevsek, bakim kontrolu bekleniyor."
        }
      ],
      downtimes: [
        {
          sequenceNo: 2,
          shiftId: shifts.night.id,
          reason: "MACHINE_FAILURE",
          note: "Fikstur baglantisi gevsek, bakim ekibi bekleniyor.",
          startedAt: minutesAgo(now, 55)
        }
      ]
    },
    {
      orderNo: `${demoOrderPrefix}QUALITY`,
      plannedQuantity: 50,
      producedQuantity: 50,
      scrapQuantity: 1,
      status: "COMPLETED",
      actualStartDate: qualityStart,
      actualEndDate: now,
      operations: [
        {
          operationName: "Kesim",
          machineId: cuttingMachine.id,
          assignedOperatorId: cuttingOperator.id,
          status: "COMPLETED",
          producedQuantity: 50,
          scrapQuantity: 0,
          startedAt: qualityStart,
          completedAt: minutesAgo(now, 215)
        },
        {
          operationName: "Montaj",
          machineId: assemblyMachine.id,
          assignedOperatorId: assemblyOperator.id,
          status: "COMPLETED",
          producedQuantity: 50,
          scrapQuantity: 1,
          startedAt: minutesAgo(now, 210),
          completedAt: minutesAgo(now, 140)
        },
        {
          operationName: "Kalite Kontrol",
          machineId: qualityMachine.id,
          assignedOperatorId: qualityOperator.id,
          status: "COMPLETED",
          producedQuantity: 50,
          scrapQuantity: 0,
          startedAt: minutesAgo(now, 135),
          completedAt: minutesAgo(now, 100)
        }
      ],
      logs: [
        { sequenceNo: 1, shiftId: shifts.morning.id, producedQuantity: 50, scrapQuantity: 0, note: "Kesim olculeri uygun." },
        { sequenceNo: 2, shiftId: shifts.evening.id, producedQuantity: 50, scrapQuantity: 1, scrapReason: "OPERATOR_ERROR", note: "Bir parca montajda hasar gordu." },
        { sequenceNo: 3, shiftId: shifts.evening.id, producedQuantity: 50, scrapQuantity: 0, note: "Final kalite kontrol tamamlandi." }
      ],
      messages: [
        {
          sequenceNo: 3,
          senderId: qualityOperator.id,
          severity: "QUALITY_ALERT",
          message: "2 urunde yuzey cizigi tespit edildi, paketleme oncesi ayrildi."
        }
      ],
      downtimes: [
        {
          sequenceNo: 3,
          shiftId: shifts.evening.id,
          reason: "QUALITY_WAITING",
          note: "Yuzey cizigi icin numune kontrolu yapildi.",
          startedAt: minutesAgo(now, 130),
          endedAt: minutesAgo(now, 115)
        }
      ],
      qualityCheck: {
        sequenceNo: 3,
        checkedById: qualityStaff.id,
        status: "PARTIAL",
        defectQuantity: 2,
        defectReason: "Yuzey cizigi",
        note: "Kalan 48 urun sevke uygun."
      }
    },
    {
      orderNo: `${demoOrderPrefix}REOPEN`,
      plannedQuantity: 120,
      producedQuantity: 0,
      scrapQuantity: 1,
      status: "PAUSED",
      actualStartDate: reopenStart,
      operations: [
        {
          operationName: "Kesim",
          machineId: cuttingMachine.id,
          assignedOperatorId: cuttingOperator.id,
          status: "COMPLETED",
          producedQuantity: 48,
          scrapQuantity: 1,
          startedAt: reopenStart,
          completedAt: minutesAgo(now, 130)
        },
        {
          operationName: "Montaj",
          machineId: assemblyMachine.id,
          assignedOperatorId: assemblyOperator.id,
          status: "PAUSED",
          producedQuantity: 0,
          scrapQuantity: 0,
          startedAt: minutesAgo(now, 120)
        },
        {
          operationName: "Kalite Kontrol",
          machineId: qualityMachine.id,
          assignedOperatorId: qualityOperator.id,
          status: "WAITING",
          producedQuantity: 0,
          scrapQuantity: 0
        }
      ],
      logs: [
        { sequenceNo: 1, shiftId: shifts.night.id, producedQuantity: 48, scrapQuantity: 1, scrapReason: "PROCESS_DEVIATION", note: "Kesim eksik kapandi, musteri planina gore yeniden acilabilir." }
      ],
      messages: [
        {
          sequenceNo: 1,
          senderId: manager.id,
          severity: "WARNING",
          message: "Kesim eksik kapandi; gerekirse yeniden uretime alinacak."
        }
      ],
      downtimes: [
        {
          sequenceNo: 1,
          shiftId: shifts.night.id,
          reason: "MATERIAL_WAITING",
          note: "Kesim icin ek malzeme bekleniyor.",
          startedAt: minutesAgo(now, 150),
          endedAt: minutesAgo(now, 130)
        }
      ]
    }
  ];

  const createdOrders = [];
  for (const scenario of scenarios) {
    createdOrders.push(
      await createDemoWorkOrder({
        admin,
        product,
        route,
        routeOperations,
        operators: { cuttingOperator, assemblyOperator, qualityOperator },
        machines,
        scenario
      })
    );
  }

  console.log({
    demo: "ok",
    orders: createdOrders.map((workOrder) => workOrder.orderNo),
    login: {
      admin: "admin@meslite.local",
      operator: "operator@meslite.local",
      assemblyOperator: "assembly.operator@meslite.local",
      qualityOperator: "quality.operator@meslite.local",
      password
    }
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
