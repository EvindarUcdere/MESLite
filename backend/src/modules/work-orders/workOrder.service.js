import { prisma } from "../../config/db.js";
import { emitEvent } from "../../config/socket.js";
import { DOMAIN_EVENTS } from "../../events/domainEvents.js";
import { emitDomainEvent } from "../../events/domainEventBus.js";
import { ApiError } from "../../utils/ApiError.js";
import { recordAuditLog } from "../audit-logs/auditLog.service.js";
import { createNotification, createNotificationsForRoles } from "../notifications/notification.service.js";

const workOrderInclude = {
  product: true,
  route: {
    include: {
      operations: {
        include: {
          defaultMachine: true
        },
        orderBy: { sequenceNo: "asc" }
      }
    }
  },
  machine: true,
  assignedOperator: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true
    }
  },
  salesOrder: true,
  salesOrderItem: {
    include: {
      product: true
    }
  },
  createdBy: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true
    }
  },
  productionLogs: {
    include: {
      operator: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true
        }
      },
      machine: true,
      workOrderOperation: true,
      attachments: true
    },
    orderBy: { createdAt: "desc" },
    take: 25
  },
  operations: {
    include: {
      routeOperation: true,
      machine: true,
      assignedOperator: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true
        }
      },
      messages: {
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true
            }
          }
        },
        orderBy: { createdAt: "desc" },
        take: 5
      },
      downtimes: {
        include: {
          shift: true,
          operator: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true
            }
          }
        },
        orderBy: { startedAt: "desc" },
        take: 5
      },
      _count: {
        select: {
          productionLogs: true
        }
      }
    },
    orderBy: { sequenceNo: "asc" }
  }
};

const MACHINE_FAMILY_RULES = [
  { family: "PRS", operationTokens: ["pres", "presleme"], machineTokens: ["prs", "pres"] },
  { family: "LZR", operationTokens: ["lazer", "kesim"], machineTokens: ["lzr", "lazer"] },
  { family: "BKM", operationTokens: ["büküm", "bukum", "abkant"], machineTokens: ["bkm", "büküm", "bukum", "abkant"] },
  { family: "CNC", operationTokens: ["cnc", "torna", "tornalama", "freze", "frezeleme"], machineTokens: ["cnc", "torna", "freze"] },
  { family: "DRL", operationTokens: ["delik", "delme", "delik delme"], machineTokens: ["drl", "delik"] },
  { family: "KYN", operationTokens: ["kaynak", "robot kaynak"], machineTokens: ["kyn", "kaynak"] },
  { family: "MNT", operationTokens: ["montaj"], machineTokens: ["mnt", "montaj"] },
  { family: "TST", operationTokens: ["fonksiyon test", "test"], machineTokens: ["tst", "test"] },
  { family: "KLT", operationTokens: ["kalite", "kontrol", "final kontrol", "ölçüm", "olcum"], machineTokens: ["klt", "kalite", "kontrol", "ölçüm", "olcum"] },
  { family: "BOY", operationTokens: ["boya", "toz boya"], machineTokens: ["boy", "boya"] },
  { family: "PKT", operationTokens: ["paket", "paketleme", "etiket"], machineTokens: ["pkt", "paket", "etiket"] }
];

function isOperator(actor) {
  return actor?.role === "OPERATOR";
}

function isBeforePlannedStart(workOrder, date = new Date()) {
  return Boolean(workOrder.plannedStartDate && date < new Date(workOrder.plannedStartDate));
}

async function notifyDuePlannedWorkOrders() {
  const now = new Date();
  const dueWorkOrders = await prisma.workOrder.findMany({
    where: {
      status: "PLANNED",
      plannedStartDate: {
        lte: now
      },
      operations: {
        some: {
          sequenceNo: 1,
          status: "READY"
        }
      }
    },
    select: {
      id: true,
      orderNo: true,
      plannedStartDate: true
    },
    take: 25
  });

  for (const workOrder of dueWorkOrders) {
    const existingNotification = await prisma.notification.findFirst({
      where: {
        type: "WORK_ORDER_START_DUE",
        entityType: "WorkOrder",
        entityId: workOrder.id
      },
      select: { id: true }
    });

    if (existingNotification) {
      continue;
    }

    await createNotificationsForRoles(["PLANNER", "PRODUCTION_MANAGER"], {
      type: "WORK_ORDER_START_DUE",
      title: "Planlı iş emri başlama zamanı geldi",
      message: `${workOrder.orderNo} iş emri planlanan başlangıç tarihine ulaştı. Üretim yöneticisi iş emrini başlatabilir.`,
      entityType: "WorkOrder",
      entityId: workOrder.id,
      metadata: {
        workOrderId: workOrder.id,
        orderNo: workOrder.orderNo,
        plannedStartDate: workOrder.plannedStartDate
      }
    });
  }
}

export async function findWorkOrders() {
  await notifyDuePlannedWorkOrders();

  return prisma.workOrder.findMany({
    include: workOrderInclude,
    orderBy: { createdAt: "desc" }
  });
}

export function findWorkOrderById(id) {
  return prisma.workOrder.findUnique({
    where: { id },
    include: {
      ...workOrderInclude,
      qualityChecks: true
    }
  });
}

function parseDateOnly(value) {
  return new Date(`${value}T00:00:00.000Z`);
}

function dateOnlyFromDate(value) {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function toNumber(value) {
  return Number(value ?? 0);
}

function assertRoutedWorkOrderCanBeCompleted(workOrder) {
  const operations = workOrder.operations ?? [];

  if (!operations.length) {
    return;
  }

  const incompleteOperation = operations.find((operation) => operation.status !== "COMPLETED");

  if (incompleteOperation) {
    throw new ApiError(
      400,
      `Rotalı iş emri tamamlanmadan önce tüm operasyonlar tamamlanmalıdır (${incompleteOperation.sequenceNo}. ${incompleteOperation.operationName}: ${incompleteOperation.status})`
    );
  }

  const finalOperation = operations.at(-1);
  const operationScrapTotal = operations.reduce((sum, operation) => sum + toNumber(operation.scrapQuantity), 0);

  if (toNumber(finalOperation?.producedQuantity) <= 0) {
    throw new ApiError(400, "Rotalı iş emri tamamlanmadan önce final operasyon üretim adedi kaydedilmelidir");
  }

  if (toNumber(workOrder.producedQuantity) !== toNumber(finalOperation.producedQuantity)) {
    throw new ApiError(
      400,
      `İş emri sağlam üretimi final operasyonla uyuşmuyor (${workOrder.producedQuantity}/${finalOperation.producedQuantity})`
    );
  }

  if (toNumber(workOrder.scrapQuantity) !== operationScrapTotal) {
    throw new ApiError(400, `İş emri fire toplamı operasyon toplamlarıyla uyuşmuyor (${workOrder.scrapQuantity}/${operationScrapTotal})`);
  }
}

async function getMaterialRequirements(tx, productId, plannedQuantity) {
  const product = await tx.product.findUnique({
    where: { id: productId },
    include: {
      bomItems: {
        include: {
          componentProduct: {
            include: { stockItem: true }
          }
        }
      }
    }
  });

  if (!product) {
    throw new ApiError(404, "Ürün bulunamadı");
  }

  return product.bomItems.map((item) => {
    const stockItem = item.componentProduct.stockItem;
    const requiredQuantity = toNumber(item.quantity) * plannedQuantity * (1 + toNumber(item.wastePercent) / 100);
    const quantityOnHand = toNumber(stockItem?.quantityOnHand);
    const reservedQuantity = toNumber(stockItem?.reservedQuantity);
    const availableQuantity = Math.max(quantityOnHand - reservedQuantity, 0);
    const shortageQuantity = Math.max(requiredQuantity - availableQuantity, 0);

    return {
      stockItemId: stockItem?.id ?? null,
      productId: item.componentProduct.id,
      code: item.componentProduct.code,
      name: item.componentProduct.name,
      unit: item.unit || item.componentProduct.unit,
      requiredQuantity,
      quantityOnHand,
      reservedQuantity,
      availableQuantity,
      shortageQuantity
    };
  });
}

function assertMaterialRequirements(requirements) {
  const shortageItems = requirements.filter((item) => item.shortageQuantity > 0);

  if (shortageItems.length) {
    const summary = shortageItems
      .slice(0, 3)
      .map((item) => `${item.code}: ${item.shortageQuantity.toFixed(2)} ${item.unit} eksik`)
      .join(", ");

    throw new ApiError(400, `Stok yetersiz. MRP kontrolünden geçmeden iş emri oluşturulamaz. ${summary}`);
  }

  return {
    hasBom: requirements.length > 0,
    isStockEnough: true,
    shortageItems
  };
}

export async function reserveMaterialStock(tx, productId, plannedQuantity) {
  const requirements = await getMaterialRequirements(tx, productId, plannedQuantity);
  const materialCheck = assertMaterialRequirements(requirements);

  for (const item of requirements) {
    const stockItem = await tx.stockItem.upsert({
      where: { productId: item.productId },
      create: {
        productId: item.productId,
        reservedQuantity: item.requiredQuantity
      },
      update: {
        reservedQuantity: {
          increment: item.requiredQuantity
        }
      }
    });

    const nextReservedQuantity = toNumber(stockItem.reservedQuantity);
    const quantityOnHand = toNumber(stockItem.quantityOnHand);

    if (nextReservedQuantity > quantityOnHand) {
      throw new ApiError(400, `${item.code} için stok rezervasyonu yapılamadı. Kullanılabilir stok yetersiz.`);
    }
  }

  return materialCheck;
}

export async function consumeReservedMaterialStock(tx, workOrder, actorId) {
  const requirements = await getMaterialRequirements(tx, workOrder.productId, toNumber(workOrder.plannedQuantity));

  for (const item of requirements) {
    const stockItem = await tx.stockItem.findUnique({
      where: { productId: item.productId }
    });

    if (!stockItem) {
      throw new ApiError(400, `${item.code} için stok kartı bulunamadı`);
    }

    const currentQuantity = toNumber(stockItem.quantityOnHand);
    const currentReservedQuantity = toNumber(stockItem.reservedQuantity);
    const nextQuantity = currentQuantity - item.requiredQuantity;

    if (nextQuantity < 0) {
      throw new ApiError(400, `${item.code} stok eksiye düşemez. Mevcut stok: ${currentQuantity}`);
    }

    const updatedStockItem = await tx.stockItem.update({
      where: { id: stockItem.id },
      data: {
        quantityOnHand: nextQuantity,
        reservedQuantity: Math.max(currentReservedQuantity - item.requiredQuantity, 0)
      }
    });

    await tx.stockMovement.create({
      data: {
        stockItemId: stockItem.id,
        productId: item.productId,
        type: "CONSUMPTION_OUT",
        quantity: item.requiredQuantity,
        balanceAfter: updatedStockItem.quantityOnHand,
        referenceType: "WorkOrder",
        referenceId: workOrder.id,
        note: `${workOrder.orderNo} iş emri malzeme tüketimi`,
        createdById: actorId
      }
    });
  }

  return requirements;
}

async function releaseReservedMaterialStock(tx, workOrder) {
  const requirements = await getMaterialRequirements(tx, workOrder.productId, toNumber(workOrder.plannedQuantity));

  for (const item of requirements) {
    const stockItem = await tx.stockItem.findUnique({
      where: { productId: item.productId }
    });

    if (!stockItem) {
      continue;
    }

    await tx.stockItem.update({
      where: { id: stockItem.id },
      data: {
        reservedQuantity: Math.max(toNumber(stockItem.reservedQuantity) - item.requiredQuantity, 0)
      }
    });
  }

  return requirements;
}

function normalizeText(value) {
  return value?.toLocaleLowerCase("tr-TR") ?? "";
}

function getMachineFamilies(machine) {
  const text = normalizeText([machine?.code, machine?.name, machine?.productionLine?.name].filter(Boolean).join(" "));
  return MACHINE_FAMILY_RULES.filter((rule) => rule.machineTokens.some((token) => text.includes(token))).map((rule) => rule.family);
}

function getOperationFamilies(operationName) {
  const text = normalizeText(operationName);
  return MACHINE_FAMILY_RULES.filter((rule) => rule.operationTokens.some((token) => text.includes(token))).map((rule) => rule.family);
}

function isMachineCompatibleWithOperation(operation, machine) {
  if (!operation || !machine) {
    return false;
  }

  if (operation.defaultMachineId && machine.id === operation.defaultMachineId) {
    return true;
  }

  const allowedFamilies = new Set([
    ...getOperationFamilies(operation.operationName),
    ...getMachineFamilies(operation.defaultMachine)
  ]);

  if (!allowedFamilies.size) {
    return true;
  }

  return getMachineFamilies(machine).some((family) => allowedFamilies.has(family));
}

function formatIstanbulDate(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(value);
}

function buildIstanbulShiftStart(workDate, startTime) {
  const dateKey = workDate instanceof Date ? workDate.toISOString().slice(0, 10) : String(workDate).slice(0, 10);
  const time = startTime?.slice(0, 5) || "00:00";
  return new Date(`${dateKey}T${time}:00+03:00`);
}

export async function notifyShiftStartWorkOrders(now = new Date()) {
  const todayKey = formatIstanbulDate(now);
  const today = parseDateOnly(todayKey);

  const operations = await prisma.workOrderOperation.findMany({
    where: {
      assignedOperatorId: { not: null },
      status: { in: ["READY", "WAITING", "IN_PROGRESS", "PAUSED"] },
      workOrder: {
        status: { in: ["PLANNED", "IN_PROGRESS", "PAUSED"] },
        plannedStartDate: {
          gte: today,
          lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
        }
      },
      assignedOperator: {
        shiftAssignments: {
          some: {
            workDate: today,
            status: { in: ["PLANNED", "CONFIRMED"] }
          }
        }
      }
    },
    include: {
      workOrder: {
        include: {
          product: true
        }
      },
      machine: true,
      assignedOperator: {
        include: {
          shiftAssignments: {
            where: {
              workDate: today,
              status: { in: ["PLANNED", "CONFIRMED"] }
            },
            include: {
              shift: true
            },
            take: 1
          }
        }
      }
    },
    take: 100
  });

  let createdCount = 0;

  for (const operation of operations) {
    const assignment = operation.assignedOperator?.shiftAssignments?.[0];
    if (!assignment) {
      continue;
    }

    const shiftStart = buildIstanbulShiftStart(assignment.workDate, assignment.startTime ?? assignment.shift.startTime);
    if (now < shiftStart) {
      continue;
    }

    const existingNotification = await prisma.notification.findFirst({
      where: {
        recipientId: operation.assignedOperatorId,
        type: "SHIFT_WORK_ORDER_START",
        entityType: "WorkOrderOperation",
        entityId: operation.id
      },
      select: { id: true }
    });

    if (existingNotification) {
      continue;
    }

    await createNotification({
      recipientId: operation.assignedOperatorId,
      type: "SHIFT_WORK_ORDER_START",
      title: "Vardiya iş emri başladı",
      message: `${assignment.shift.name} başladı. ${operation.workOrder.orderNo} iş emrinde ${operation.operationName} operasyonu sizde.`,
      entityType: "WorkOrderOperation",
      entityId: operation.id,
      metadata: {
        workOrderId: operation.workOrderId,
        orderNo: operation.workOrder.orderNo,
        productName: operation.workOrder.product.name,
        operationId: operation.id,
        operationName: operation.operationName,
        machineId: operation.machineId,
        machineCode: operation.machine?.code,
        machineName: operation.machine?.name,
        shiftId: assignment.shiftId,
        shiftName: assignment.shift.name,
        shiftStartAt: shiftStart
      }
    });

    emitDomainEvent(DOMAIN_EVENTS.SHIFT_STARTED, {
      workOrderId: operation.workOrderId,
      workOrderNo: operation.workOrder.orderNo,
      operationId: operation.id,
      operationName: operation.operationName,
      operatorId: operation.assignedOperatorId,
      machineId: operation.machineId,
      shiftId: assignment.shiftId,
      shiftName: assignment.shift.name,
      shiftStartAt: shiftStart
    });

    createdCount += 1;
  }

  return { checked: operations.length, created: createdCount };
}

export async function findAvailableOperators({ workDate, shiftId, machineId }) {
  const date = parseDateOnly(workDate);
  const operators = await prisma.user.findMany({
    where: {
      role: "OPERATOR",
      isActive: true
    },
    include: {
      shiftAssignments: {
        where: {
          workDate: date,
          ...(shiftId ? { shiftId } : {}),
          status: {
            in: ["PLANNED", "CONFIRMED"]
          }
        },
        include: {
          shift: true
        }
      },
      machineSkills: {
        where: {
          ...(machineId ? { machineId } : {}),
          isActive: true
        },
        include: {
          machine: true
        }
      },
      assignedOperations: {
        where: {
          status: {
            in: ["READY", "IN_PROGRESS", "PAUSED"]
          },
          workOrder: {
            status: {
              in: ["PLANNED", "IN_PROGRESS", "PAUSED"]
            }
          }
        },
        select: {
          id: true,
          operationName: true,
          workOrder: {
            select: {
              id: true,
              orderNo: true,
              plannedStartDate: true
            }
          }
        }
      }
    },
    orderBy: {
      name: "asc"
    }
  });

  return operators.map((operator) => {
    const hasShiftAssignment = operator.shiftAssignments.length > 0;
    const hasMachineSkill = !machineId || operator.machineSkills.length > 0;
    const activeOperationCount = operator.assignedOperations.length;

    return {
      id: operator.id,
      name: operator.name,
      email: operator.email,
      isAvailable: hasShiftAssignment && hasMachineSkill,
      hasShiftAssignment,
      hasMachineSkill,
      activeOperationCount,
      shiftAssignments: operator.shiftAssignments,
      machineSkills: operator.machineSkills,
      activeOperations: operator.assignedOperations
    };
  });
}

export async function createWorkOrder(userId, data) {
  const result = await prisma.$transaction(async (tx) => {
    let route = null;

    if (data.routeId) {
      route = await tx.productRoute.findUnique({
        where: { id: data.routeId },
        include: {
          operations: {
            include: {
              defaultMachine: {
                include: {
                  productionLine: true
                }
              }
            },
            orderBy: { sequenceNo: "asc" }
          }
        }
      });

      if (!route || !route.isActive) {
        throw new ApiError(400, "Aktif ürün rotası gereklidir");
      }

      if (route.productId !== data.productId) {
        throw new ApiError(400, "Seçilen rota seçilen ürüne ait olmalıdır");
      }

      if (!route.operations.length) {
        throw new ApiError(400, "Selected route must have at least one operation");
      }
    }

    const assignmentMap = new Map((data.operationAssignments ?? []).map((assignment) => [assignment.routeOperationId, assignment]));

    if (route && data.operationAssignments?.length) {
      if (!data.plannedStartDate) {
        throw new ApiError(400, "Operatör ataması için plan başlangıç tarihi gereklidir");
      }

      const workDate = dateOnlyFromDate(data.plannedStartDate);

      for (const operation of route.operations) {
        const assignment = assignmentMap.get(operation.id);
        const machineId = assignment?.machineId ?? operation.defaultMachineId ?? data.machineId;
        const operatorId = assignment?.assignedOperatorId ?? data.assignedOperatorId;

        if (machineId) {
          const machine = await tx.machine.findUnique({
            where: { id: machineId },
            include: { productionLine: true }
          });

          if (!machine || !machine.isActive) {
            throw new ApiError(400, `${operation.operationName} operasyonu için aktif makine seçilmelidir`);
          }

          if (!isMachineCompatibleWithOperation(operation, machine)) {
            throw new ApiError(400, `${operation.operationName} operasyonu ${machine.code} makinesinde planlanamaz`);
          }
        }

        if (!operatorId) {
          continue;
        }

        const operator = await tx.user.findUnique({
          where: { id: operatorId },
          include: {
            shiftAssignments: {
              where: {
                workDate,
                ...(data.shiftId ? { shiftId: data.shiftId } : {}),
                status: {
                  in: ["PLANNED", "CONFIRMED"]
                }
              }
            },
            machineSkills: {
              where: {
                ...(machineId ? { machineId } : {}),
                isActive: true
              }
            }
          }
        });

        if (!operator || operator.role !== "OPERATOR" || !operator.isActive) {
          throw new ApiError(400, `${operation.operationName} operasyonu için aktif operatör seçilmelidir`);
        }

        if (!operator.shiftAssignments.length) {
          throw new ApiError(400, `${operator.name} seçilen tarih/vardiyada çalışmıyor`);
        }

        if (machineId && !operator.machineSkills.length) {
          throw new ApiError(400, `${operator.name} seçilen makine için yetkin değil`);
        }
      }
    }

    const workOrder = await tx.workOrder.create({
      data: {
        orderNo: data.orderNo,
        productId: data.productId,
        routeId: data.routeId,
        machineId: data.machineId,
        assignedOperatorId: data.assignedOperatorId,
        plannedQuantity: data.plannedQuantity,
        plannedStartDate: data.plannedStartDate ? new Date(data.plannedStartDate) : undefined,
        plannedEndDate: data.plannedEndDate ? new Date(data.plannedEndDate) : undefined,
        salesOrderId: data.salesOrderId,
        salesOrderItemId: data.salesOrderItemId,
        createdById: userId
      }
    });

    const materialCheck = await reserveMaterialStock(tx, data.productId, Number(data.plannedQuantity));

    if (route) {
      await tx.workOrderOperation.createMany({
        data: route.operations.map((operation, index) => {
          const assignment = assignmentMap.get(operation.id);

          return {
            workOrderId: workOrder.id,
            routeOperationId: operation.id,
            machineId: assignment?.machineId ?? operation.defaultMachineId ?? data.machineId,
            assignedOperatorId: assignment?.assignedOperatorId ?? data.assignedOperatorId,
            sequenceNo: operation.sequenceNo,
            operationName: operation.operationName,
            status: index === 0 ? "READY" : "WAITING"
          };
        })
      });
    }

    await recordAuditLog(
      {
        actorId: userId,
        action: "WORK_ORDER_CREATED",
        entityType: "WorkOrder",
        entityId: workOrder.id,
        summary: `${workOrder.orderNo} iş emri oluşturuldu`,
        metadata: {
          orderNo: workOrder.orderNo,
          plannedQuantity: workOrder.plannedQuantity,
          productId: workOrder.productId,
          routeId: workOrder.routeId,
          operationCount: route?.operations.length ?? 0,
          materialCheck: {
            hasBom: materialCheck.hasBom,
            isStockEnough: materialCheck.isStockEnough
          }
        }
      },
      tx
    );

    return tx.workOrder.findUnique({
      where: { id: workOrder.id },
      include: workOrderInclude
    });
  });

  emitDomainEvent(DOMAIN_EVENTS.WORK_ORDER_CREATED, {
    workOrder: result,
    workOrderId: result.id,
    workOrderNo: result.orderNo,
    productId: result.productId,
    routeId: result.routeId,
    plannedQuantity: result.plannedQuantity,
    operationCount: result.operations?.length ?? 0,
    createdById: userId
  });
  emitEvent("workOrder:updated", result);

  const firstOperation = result.operations?.find((operation) => operation.sequenceNo === 1) ?? result.operations?.[0];
  const recipientId = firstOperation?.assignedOperatorId ?? result.assignedOperatorId;

  if (recipientId && recipientId !== userId) {
    await createNotification({
      recipientId,
      type: firstOperation ? "OPERATION_ASSIGNED" : "WORK_ORDER_ASSIGNED",
      title: firstOperation ? "Yeni operasyon atandı" : "Yeni iş emri atandı",
      message: firstOperation
        ? `${result.orderNo} iş emrinde ${firstOperation.operationName} operasyonu size atandı.`
        : `${result.orderNo} iş emri size atandı.`,
      entityType: firstOperation ? "WorkOrderOperation" : "WorkOrder",
      entityId: firstOperation?.id ?? result.id,
      metadata: {
        workOrderId: result.id,
        orderNo: result.orderNo,
        operationId: firstOperation?.id,
        operationName: firstOperation?.operationName,
        assignedById: userId
      }
    });
  }

  return result;
}

export async function updateWorkOrderStatus(actor, id, status) {
  const statusDates = {
    ...(status === "IN_PROGRESS" ? { actualStartDate: new Date() } : {}),
    ...(status === "COMPLETED" ? { actualEndDate: new Date() } : {})
  };

  const workOrder = await prisma.$transaction(async (tx) => {
    const current = await tx.workOrder.findUnique({
      where: { id },
      include: {
        operations: {
          orderBy: { sequenceNo: "asc" }
        }
      }
    });

    if (!current) {
      throw new ApiError(404, "İş emri bulunamadı");
    }

    if (status === "CANCELLED" && !["COMPLETED", "CANCELLED"].includes(current.status)) {
      await releaseReservedMaterialStock(tx, current);
    }

    if (status === "COMPLETED" && current.status !== "COMPLETED") {
      if (toNumber(current.producedQuantity) <= 0) {
        throw new ApiError(400, "İş emri tamamlanmadan önce üretim adedi kaydedilmelidir");
      }

      assertRoutedWorkOrderCanBeCompleted(current);

      await consumeReservedMaterialStock(tx, current, actor?.id ?? current.createdById);
    }

    const updated = await tx.workOrder.update({
      where: { id },
      data: { status, ...statusDates },
      include: workOrderInclude
    });

    await recordAuditLog(
      {
        actorId: actor?.id,
        action: "WORK_ORDER_STATUS_CHANGED",
        entityType: "WorkOrder",
        entityId: updated.id,
        summary: `${updated.orderNo} iş emri durumu ${status} yapıldı`,
        metadata: { status }
      },
      tx
    );

    return updated;
  });

  emitEvent("workOrder:updated", workOrder);

  return workOrder;
}

export async function assignOperator(actor, id, operatorId) {
  const operator = await prisma.user.findUnique({ where: { id: operatorId } });

  if (!operator || operator.role !== "OPERATOR" || !operator.isActive) {
    throw new ApiError(400, "Aktif operatör kullanıcısı gereklidir");
  }

  const workOrder = await prisma.$transaction(async (tx) => {
    const updated = await tx.workOrder.update({
      where: { id },
      data: { assignedOperatorId: operatorId },
      include: workOrderInclude
    });

    await recordAuditLog(
      {
        actorId: actor?.id,
        action: "WORK_ORDER_OPERATOR_ASSIGNED",
        entityType: "WorkOrder",
        entityId: updated.id,
        summary: `${updated.orderNo} iş emrine ${operator.name} operatörü atandı`,
        metadata: { operatorId, operatorName: operator.name }
      },
      tx
    );

    return updated;
  });

  emitEvent("workOrder:updated", workOrder);
  return workOrder;
}

export async function assignMachine(actor, id, machineId) {
  const machine = await prisma.machine.findUnique({ where: { id: machineId } });

  if (!machine || !machine.isActive) {
    throw new ApiError(400, "Aktif makine gereklidir");
  }

  const workOrder = await prisma.$transaction(async (tx) => {
    const updated = await tx.workOrder.update({
      where: { id },
      data: { machineId },
      include: workOrderInclude
    });

    await recordAuditLog(
      {
        actorId: actor?.id,
        action: "WORK_ORDER_MACHINE_ASSIGNED",
        entityType: "WorkOrder",
        entityId: updated.id,
        summary: `${updated.orderNo} iş emrine ${machine.code} makinesi atandı`,
        metadata: { machineId, machineCode: machine.code, machineName: machine.name }
      },
      tx
    );

    return updated;
  });

  emitEvent("workOrder:updated", workOrder);
  return workOrder;
}

export async function startWorkOrder(id, actor) {
  const current = await prisma.workOrder.findUnique({
    where: { id },
    include: {
      operations: {
        orderBy: { sequenceNo: "asc" }
      }
    }
  });

  if (!current) {
    throw new ApiError(404, "İş emri bulunamadı");
  }

  if (["COMPLETED", "CANCELLED"].includes(current.status)) {
    throw new ApiError(400, "Completed or cancelled work orders cannot be started");
  }

  if (isBeforePlannedStart(current)) {
    throw new ApiError(400, "Plan başlangıç tarihi gelmeden iş emri başlatılamaz");
  }

  const hasOperationFlow = current.operations.length > 0;
  const targetOperation = hasOperationFlow
    ? current.operations.find((operation) => operation.status === "PAUSED") ?? current.operations.find((operation) => operation.status === "READY")
    : null;

  if (hasOperationFlow && !targetOperation) {
    throw new ApiError(400, "No paused or ready operation can be started for this work order");
  }

  if (hasOperationFlow && (!targetOperation.machineId || !targetOperation.assignedOperatorId)) {
    throw new ApiError(400, "Üretim başlatılmadan önce operasyon makinesi ve operatörü atanmalıdır");
  }

  if (!hasOperationFlow && (!current.machineId || !current.assignedOperatorId)) {
    throw new ApiError(400, "Üretim başlatılmadan önce makine ve operatör atanmalıdır");
  }

  const result = await prisma.$transaction(async (tx) => {
    let operation = null;

    if (targetOperation) {
      operation = await tx.workOrderOperation.update({
        where: { id: targetOperation.id },
        data: {
          status: "IN_PROGRESS",
          startedAt: targetOperation.startedAt ?? new Date()
        },
        include: {
          workOrder: { include: { product: true, route: true } },
          routeOperation: true,
          machine: true,
          assignedOperator: {
            select: { id: true, name: true, email: true, role: true }
          },
          messages: {
            include: {
              sender: {
                select: { id: true, name: true, email: true, role: true }
              }
            },
            orderBy: { createdAt: "desc" },
            take: 5
          },
          _count: {
            select: {
              productionLogs: true
            }
          }
        }
      });
    }

    const updated = await tx.workOrder.update({
      where: { id },
      data: {
        status: "IN_PROGRESS",
        actualStartDate: current.actualStartDate ?? new Date()
      },
      include: workOrderInclude
    });

    const machine = await tx.machine.update({
      where: { id: targetOperation?.machineId ?? current.machineId },
      data: { status: "RUNNING" }
    });

    await recordAuditLog(
      {
        actorId: actor?.id,
        action: "WORK_ORDER_STARTED",
        entityType: "WorkOrder",
        entityId: updated.id,
        summary: `${updated.orderNo} iş emri başlatıldı`,
        metadata: {
          orderNo: updated.orderNo,
          operationId: operation?.id,
          operationName: operation?.operationName,
          machineId: machine.id
        }
      },
      tx
    );

    if (actor?.role === "PRODUCTION_MANAGER" && operation?.assignedOperatorId && operation.assignedOperatorId !== actor.id) {
      const isRestart = targetOperation?.status === "PAUSED";
      await createNotification(
        {
          recipientId: operation.assignedOperatorId,
          type: isRestart ? "OPERATION_RESTARTED" : "OPERATION_STARTED",
          title: isRestart ? "Operasyon tekrar başlatıldı" : "Operasyon başlatıldı",
          message: `${updated.orderNo} iş emrinde ${operation.operationName} operasyonu yönetici tarafından başlatıldı.`,
          entityType: "WorkOrderOperation",
          entityId: operation.id,
          metadata: {
            workOrderId: updated.id,
            orderNo: updated.orderNo,
            operationName: operation.operationName,
            previousStatus: targetOperation?.status,
            startedById: actor.id,
            startedByName: actor.name
          }
        },
        tx
      );
    } else if (actor?.role === "PRODUCTION_MANAGER" && !operation && updated.assignedOperatorId && updated.assignedOperatorId !== actor.id) {
      const isRestart = current.status === "PAUSED";
      await createNotification(
        {
          recipientId: updated.assignedOperatorId,
          type: isRestart ? "WORK_ORDER_RESTARTED" : "WORK_ORDER_STARTED",
          title: isRestart ? "İş emri tekrar başlatıldı" : "İş emri başlatıldı",
          message: `${updated.orderNo} iş emri yönetici tarafından başlatıldı.`,
          entityType: "WorkOrder",
          entityId: updated.id,
          metadata: {
            workOrderId: updated.id,
            orderNo: updated.orderNo,
            previousStatus: current.status,
            startedById: actor.id,
            startedByName: actor.name
          }
        },
        tx
      );
    }

    return { workOrder: updated, operation, machine };
  });

  emitDomainEvent(DOMAIN_EVENTS.WORK_ORDER_STARTED, {
    workOrder: result.workOrder,
    operation: result.operation,
    machine: result.machine,
    workOrderId: result.workOrder.id,
    workOrderNo: result.workOrder.orderNo,
    operationId: result.operation?.id,
    operationName: result.operation?.operationName,
    startedById: actor?.id
  });
  if (result.operation) {
    emitEvent("workOrderOperation:updated", result.operation);
  }
  emitEvent("workOrder:updated", result.workOrder);
  emitEvent("machine:statusChanged", result.machine);
  return result.workOrder;
}

export async function pauseWorkOrder(id, actor) {
  const current = await prisma.workOrder.findUnique({
    where: { id },
    include: {
      operations: {
        orderBy: { sequenceNo: "asc" }
      }
    }
  });

  if (!current) {
    throw new ApiError(404, "İş emri bulunamadı");
  }

  if (current.status !== "IN_PROGRESS") {
    throw new ApiError(400, "Only in-progress work orders can be paused");
  }

  const activeOperation = current.operations.find((operation) => operation.status === "IN_PROGRESS");

  const result = await prisma.$transaction(async (tx) => {
    let operation = null;

    if (current.operations.length) {
      if (!activeOperation) {
        throw new ApiError(400, "No in-progress operation can be paused for this work order");
      }

      operation = await tx.workOrderOperation.update({
        where: { id: activeOperation.id },
        data: { status: "PAUSED" },
        include: {
          workOrder: { include: { product: true, route: true } },
          routeOperation: true,
          machine: true,
          assignedOperator: {
            select: { id: true, name: true, email: true, role: true }
          },
          messages: {
            include: {
              sender: {
                select: { id: true, name: true, email: true, role: true }
              }
            },
            orderBy: { createdAt: "desc" },
            take: 5
          },
          _count: {
            select: {
              productionLogs: true
            }
          }
        }
      });
    }

    const updated = await tx.workOrder.update({
      where: { id },
      data: { status: "PAUSED" },
      include: workOrderInclude
    });

    let machine = null;

    const machineId = activeOperation?.machineId ?? current.machineId;

    if (machineId) {
      machine = await tx.machine.update({
        where: { id: machineId },
        data: { status: "STOPPED" }
      });
    }

    await recordAuditLog(
      {
        actorId: actor?.id,
        action: "WORK_ORDER_PAUSED",
        entityType: "WorkOrder",
        entityId: updated.id,
        summary: `${updated.orderNo} iş emri duraklatıldı`,
        metadata: {
          orderNo: updated.orderNo,
          operationId: operation?.id,
          operationName: operation?.operationName,
          machineId
        }
      },
      tx
    );

    return { workOrder: updated, operation, machine };
  });

  emitDomainEvent(DOMAIN_EVENTS.WORK_ORDER_PAUSED, {
    workOrder: result.workOrder,
    operation: result.operation,
    machine: result.machine,
    workOrderId: result.workOrder.id,
    workOrderNo: result.workOrder.orderNo,
    operationId: result.operation?.id,
    operationName: result.operation?.operationName,
    pausedById: actor?.id
  });
  if (result.operation) {
    emitEvent("workOrderOperation:updated", result.operation);
  }
  emitEvent("workOrder:updated", result.workOrder);
  if (result.machine) {
    emitEvent("machine:statusChanged", result.machine);
  }
  return result.workOrder;
}

export async function completeWorkOrder(actor, id) {
  const current = await prisma.workOrder.findUnique({
    where: { id },
    include: {
      operations: {
        orderBy: { sequenceNo: "asc" }
      }
    }
  });

  if (!current) {
    throw new ApiError(404, "İş emri bulunamadı");
  }

  if (!["IN_PROGRESS", "PAUSED"].includes(current.status)) {
    throw new ApiError(400, "Only started work orders can be completed");
  }

  if (current.producedQuantity <= 0) {
    throw new ApiError(400, "İş emri tamamlanmadan önce üretim adedi kaydedilmelidir");
  }

  if (actor.role === "OPERATOR" && current.producedQuantity < current.plannedQuantity) {
    throw new ApiError(400, `Planlanan adet üretilmeden iş emri tamamlanamaz (${current.producedQuantity}/${current.plannedQuantity})`);
  }

  assertRoutedWorkOrderCanBeCompleted(current);

  const result = await prisma.$transaction(async (tx) => {
    const consumedMaterials = await consumeReservedMaterialStock(tx, current, actor?.id ?? current.createdById);

    const updated = await tx.workOrder.update({
      where: { id },
      data: {
        status: "COMPLETED",
        actualEndDate: new Date()
      },
      include: workOrderInclude
    });

    let machine = null;

    if (current.machineId) {
      machine = await tx.machine.update({
        where: { id: current.machineId },
        data: { status: "IDLE" }
      });
    }

    await recordAuditLog(
      {
        actorId: actor?.id,
        action: "WORK_ORDER_COMPLETED",
        entityType: "WorkOrder",
        entityId: updated.id,
        summary: `${updated.orderNo} iş emri tamamlandı`,
        metadata: {
          orderNo: updated.orderNo,
          plannedQuantity: current.plannedQuantity,
          producedQuantity: current.producedQuantity,
          scrapQuantity: current.scrapQuantity,
          consumedMaterialCount: consumedMaterials.length,
          managerOverride: actor?.role !== "OPERATOR" && current.producedQuantity < current.plannedQuantity
        }
      },
      tx
    );

    return { workOrder: updated, machine };
  });

  emitEvent("workOrder:updated", result.workOrder);
  emitEvent("machine:statusChanged", result.machine);
  return result.workOrder;
}


