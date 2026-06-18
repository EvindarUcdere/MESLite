import { prisma } from "../../config/db.js";

const productInclude = {
  bomItems: {
    include: {
      componentProduct: true
    },
    orderBy: {
      createdAt: "asc"
    }
  }
};

export function findProducts() {
  return prisma.product.findMany({
    include: productInclude,
    orderBy: { createdAt: "desc" }
  });
}

export function findProductById(id) {
  return prisma.product.findUnique({
    where: { id },
    include: productInclude
  });
}

export function createProduct(data) {
  return prisma.product.create({
    data,
    include: productInclude
  });
}

export function updateProduct(id, data) {
  return prisma.product.update({
    where: { id },
    data,
    include: productInclude
  });
}

export async function replaceProductBom(productId, items) {
  const product = await prisma.product.findUnique({ where: { id: productId } });

  if (!product) {
    const error = new Error("Product not found");
    error.statusCode = 404;
    throw error;
  }

  if (items.some((item) => item.componentProductId === productId)) {
    const error = new Error("A product cannot use itself as a BOM component");
    error.statusCode = 400;
    throw error;
  }

  const componentIds = items.map((item) => item.componentProductId);
  const uniqueComponentIds = new Set(componentIds);

  if (uniqueComponentIds.size !== componentIds.length) {
    const error = new Error("Duplicate BOM component");
    error.statusCode = 400;
    throw error;
  }

  const componentCount = await prisma.product.count({
    where: {
      id: { in: [...uniqueComponentIds] },
      isActive: true
    }
  });

  if (componentCount !== uniqueComponentIds.size) {
    const error = new Error("One or more BOM components are not active products");
    error.statusCode = 400;
    throw error;
  }

  return prisma.$transaction(async (tx) => {
    await tx.productBomItem.deleteMany({ where: { productId } });

    if (items.length) {
      await tx.productBomItem.createMany({
        data: items.map((item) => ({
          productId,
          componentProductId: item.componentProductId,
          quantity: item.quantity,
          unit: item.unit,
          wastePercent: item.wastePercent ?? 0,
          note: item.note || null
        }))
      });
    }

    return tx.product.findUnique({
      where: { id: productId },
      include: productInclude
    });
  });
}
