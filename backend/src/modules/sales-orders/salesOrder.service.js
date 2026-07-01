import { prisma } from "../../config/db.js";
import { ApiError } from "../../utils/ApiError.js";
import { createWorkOrder } from "../work-orders/workOrder.service.js";

const salesOrderInclude = {
  createdBy: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true
    }
  },
  items: {
    include: {
      product: {
        include: {
          routes: {
            where: { isActive: true },
            include: {
              operations: {
                include: {
                  defaultMachine: true
                },
                orderBy: { sequenceNo: "asc" }
              }
            },
            orderBy: { createdAt: "desc" },
            take: 1
          }
        }
      },
      workOrders: {
        include: {
          product: true,
          route: true
        },
        orderBy: { createdAt: "desc" }
      }
    },
    orderBy: { createdAt: "asc" }
  },
  workOrders: {
    include: {
      product: true,
      route: true
    },
    orderBy: { createdAt: "desc" }
  }
};

function toNumber(value) {
  return Number(value ?? 0);
}

function roundQuantity(value) {
  return Math.ceil(Number(value) * 1000) / 1000;
}

function buildOrderNo(orderNo, index) {
  return `${orderNo}-WO-${String(index + 1).padStart(2, "0")}`;
}

export function listSalesOrders() {
  return prisma.salesOrder.findMany({
    include: salesOrderInclude,
    orderBy: { createdAt: "desc" }
  });
}

export function findSalesOrderById(id) {
  return prisma.salesOrder.findUnique({
    where: { id },
    include: salesOrderInclude
  });
}

export async function createSalesOrder(userId, data) {
  const productIds = data.items.map((item) => item.productId);
  const productCount = await prisma.product.count({
    where: {
      id: { in: productIds },
      isActive: true
    }
  });

  if (productCount !== new Set(productIds).size) {
    throw new ApiError(400, "Siparişte pasif veya bulunamayan ürün var");
  }

  return prisma.salesOrder.create({
    data: {
      orderNo: data.orderNo,
      customerName: data.customerName,
      requestedDate: data.requestedDate ? new Date(data.requestedDate) : undefined,
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      note: data.note || null,
      createdById: userId,
      items: {
        create: data.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unit: item.unit || "adet",
          note: item.note || null
        }))
      }
    },
    include: salesOrderInclude
  });
}

export async function calculateSalesOrderMrp(id) {
  const salesOrder = await prisma.salesOrder.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          product: {
            include: {
              bomItems: {
                include: {
                  componentProduct: {
                    include: {
                      stockItem: true
                    }
                  }
                }
              },
              stockItem: true
            }
          }
        }
      }
    }
  });

  if (!salesOrder) {
    throw new ApiError(404, "Satış siparişi bulunamadı");
  }

  const requirementMap = new Map();

  for (const item of salesOrder.items) {
    const bomItems = item.product.bomItems;
    const sourceItems = bomItems.length
      ? bomItems.map((bomItem) => ({
          product: bomItem.componentProduct,
          unit: bomItem.unit || bomItem.componentProduct.unit,
          requiredQuantity: item.quantity * toNumber(bomItem.quantity) * (1 + toNumber(bomItem.wastePercent) / 100),
          sourceProduct: item.product,
          bomQuantity: toNumber(bomItem.quantity),
          wastePercent: toNumber(bomItem.wastePercent)
        }))
      : [
          {
            product: item.product,
            unit: item.product.unit,
            requiredQuantity: item.quantity,
            sourceProduct: item.product,
            bomQuantity: 1,
            wastePercent: 0
          }
        ];

    for (const requirement of sourceItems) {
      const existing = requirementMap.get(requirement.product.id);
      const stockItem = requirement.product.stockItem;
      const requiredQuantity = roundQuantity(requirement.requiredQuantity);

      if (existing) {
        existing.requiredQuantity = roundQuantity(existing.requiredQuantity + requiredQuantity);
        existing.sources.push({
          productId: requirement.sourceProduct.id,
          code: requirement.sourceProduct.code,
          name: requirement.sourceProduct.name,
          orderQuantity: item.quantity,
          bomQuantity: requirement.bomQuantity,
          wastePercent: requirement.wastePercent
        });
      } else {
        const quantityOnHand = toNumber(stockItem?.quantityOnHand);
        const reservedQuantity = toNumber(stockItem?.reservedQuantity);
        requirementMap.set(requirement.product.id, {
          productId: requirement.product.id,
          code: requirement.product.code,
          name: requirement.product.name,
          unit: requirement.unit,
          requiredQuantity,
          quantityOnHand,
          reservedQuantity,
          availableQuantity: Math.max(quantityOnHand - reservedQuantity, 0),
          shortageQuantity: 0,
          location: stockItem?.location ?? null,
          sources: [
            {
              productId: requirement.sourceProduct.id,
              code: requirement.sourceProduct.code,
              name: requirement.sourceProduct.name,
              orderQuantity: item.quantity,
              bomQuantity: requirement.bomQuantity,
              wastePercent: requirement.wastePercent
            }
          ]
        });
      }
    }
  }

  const requirements = [...requirementMap.values()].map((item) => ({
    ...item,
    shortageQuantity: Math.max(roundQuantity(item.requiredQuantity - item.availableQuantity), 0),
    isEnough: item.availableQuantity >= item.requiredQuantity
  }));

  return {
    salesOrder,
    requirements,
    isMaterialReady: requirements.every((item) => item.isEnough),
    totalShortageItems: requirements.filter((item) => !item.isEnough).length
  };
}

export async function createWorkOrdersFromSalesOrder(userId, id, options = {}) {
  const mrp = await calculateSalesOrderMrp(id);

  if (!mrp.isMaterialReady) {
    throw new ApiError(400, "Eksik malzeme varken iş emri oluşturulamaz");
  }

  const salesOrder = await prisma.salesOrder.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          product: {
            include: {
              routes: {
                where: { isActive: true },
                include: {
                  operations: {
                    include: {
                      defaultMachine: true
                    },
                    orderBy: { sequenceNo: "asc" }
                  }
                },
                orderBy: { createdAt: "desc" },
                take: 1
              }
            }
          },
          workOrders: true
        },
        orderBy: { createdAt: "asc" }
      }
    }
  });

  if (!salesOrder) {
    throw new ApiError(404, "Satış siparişi bulunamadı");
  }

  const plannedStartDate = options.plannedStartDate ?? salesOrder.requestedDate?.toISOString();
  const plannedEndDate = options.plannedEndDate ?? salesOrder.dueDate?.toISOString();

  if (!plannedStartDate || !plannedEndDate) {
    throw new ApiError(400, "İş emri oluşturmak için plan başlangıç ve bitiş tarihleri zorunludur");
  }

  const createdWorkOrders = [];

  for (const [index, item] of salesOrder.items.entries()) {
    if (item.workOrders.length) {
      createdWorkOrders.push(...item.workOrders);
      continue;
    }

    const route = item.product.routes[0];

    if (!route) {
      throw new ApiError(400, `${item.product.code} ürünü için aktif rota bulunamadı`);
    }

    const workOrder = await createWorkOrder(userId, {
      orderNo: buildOrderNo(salesOrder.orderNo, index),
      productId: item.productId,
      routeId: route.id,
      machineId: route.operations[0]?.defaultMachineId ?? undefined,
      plannedQuantity: item.quantity,
      plannedStartDate,
      plannedEndDate,
      salesOrderId: salesOrder.id,
      salesOrderItemId: item.id
    });

    createdWorkOrders.push(workOrder);
  }

  await prisma.salesOrder.update({
    where: { id },
    data: {
      status: "PLANNED"
    }
  });

  return {
    salesOrder: await findSalesOrderById(id),
    workOrders: createdWorkOrders
  };
}
