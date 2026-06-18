import { prisma } from "../../config/db.js";
import { ApiError } from "../../utils/ApiError.js";

const inboundTypes = new Set(["PURCHASE_IN", "PRODUCTION_IN", "ADJUSTMENT_IN"]);
const outboundTypes = new Set(["CONSUMPTION_OUT", "SCRAP_OUT", "ADJUSTMENT_OUT"]);

const stockItemInclude = {
  product: true
};

function toNumber(value) {
  return Number(value ?? 0);
}

function mapStockItem(product) {
  const stockItem = product.stockItem;
  const quantityOnHand = toNumber(stockItem?.quantityOnHand);
  const reservedQuantity = toNumber(stockItem?.reservedQuantity);
  const minimumQuantity = toNumber(stockItem?.minimumQuantity);

  return {
    id: stockItem?.id ?? null,
    productId: product.id,
    product,
    quantityOnHand,
    reservedQuantity,
    availableQuantity: Math.max(quantityOnHand - reservedQuantity, 0),
    minimumQuantity,
    location: stockItem?.location ?? null,
    isBelowMinimum: quantityOnHand < minimumQuantity,
    updatedAt: stockItem?.updatedAt ?? product.updatedAt
  };
}

export async function listStockItems() {
  const products = await prisma.product.findMany({
    include: { stockItem: true },
    orderBy: { code: "asc" }
  });

  return products.map(mapStockItem);
}

export async function listStockMovements(filters = {}) {
  return prisma.stockMovement.findMany({
    where: {
      ...(filters.productId ? { productId: filters.productId } : {})
    },
    include: {
      product: true,
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    },
    orderBy: { createdAt: "desc" },
    take: 100
  });
}

export async function updateStockItemSettings(productId, data) {
  const product = await prisma.product.findUnique({ where: { id: productId } });

  if (!product) {
    throw new ApiError(404, "Ürün bulunamadı");
  }

  return prisma.stockItem.upsert({
    where: { productId },
    create: {
      productId,
      minimumQuantity: data.minimumQuantity ?? 0,
      reservedQuantity: data.reservedQuantity ?? 0,
      location: data.location || null
    },
    update: {
      ...(data.minimumQuantity !== undefined ? { minimumQuantity: data.minimumQuantity } : {}),
      ...(data.reservedQuantity !== undefined ? { reservedQuantity: data.reservedQuantity } : {}),
      ...(data.location !== undefined ? { location: data.location || null } : {})
    },
    include: stockItemInclude
  });
}

export async function createStockMovement(data, userId) {
  const product = await prisma.product.findUnique({ where: { id: data.productId } });

  if (!product) {
    throw new ApiError(404, "Ürün bulunamadı");
  }

  return prisma.$transaction(async (tx) => {
    const stockItem = await tx.stockItem.upsert({
      where: { productId: data.productId },
      create: { productId: data.productId },
      update: {}
    });

    const currentQuantity = toNumber(stockItem.quantityOnHand);
    const quantity = Number(data.quantity);
    const nextQuantity = inboundTypes.has(data.type) ? currentQuantity + quantity : currentQuantity - quantity;

    if (!inboundTypes.has(data.type) && !outboundTypes.has(data.type)) {
      throw new ApiError(400, "Geçersiz stok hareket tipi");
    }

    if (nextQuantity < 0) {
      throw new ApiError(400, `Stok eksiye düşemez. Mevcut stok: ${currentQuantity}`);
    }

    const updatedStockItem = await tx.stockItem.update({
      where: { id: stockItem.id },
      data: { quantityOnHand: nextQuantity }
    });

    const movement = await tx.stockMovement.create({
      data: {
        stockItemId: stockItem.id,
        productId: data.productId,
        type: data.type,
        quantity,
        balanceAfter: nextQuantity,
        referenceType: data.referenceType || null,
        referenceId: data.referenceId || null,
        note: data.note || null,
        createdById: userId
      },
      include: {
        product: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    return { stockItem: updatedStockItem, movement };
  });
}
