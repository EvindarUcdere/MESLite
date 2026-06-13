import { prisma } from "../../config/db.js";
import { ApiError } from "../../utils/ApiError.js";

const includeRelations = {
  product: true,
  operations: {
    include: {
      defaultMachine: true
    },
    orderBy: {
      sequenceNo: "asc"
    }
  }
};

function normalizeOperations(operations = []) {
  const sequenceSet = new Set();

  return operations.map((operation) => {
    if (sequenceSet.has(operation.sequenceNo)) {
      throw new ApiError(400, "Bir rotadaki operasyon sıra numaraları benzersiz olmalıdır");
    }

    sequenceSet.add(operation.sequenceNo);

    return {
      operationName: operation.operationName,
      sequenceNo: operation.sequenceNo,
      defaultMachineId: operation.defaultMachineId || null,
      estimatedMinutes: operation.estimatedMinutes || null,
      requiresQualityCheck: operation.requiresQualityCheck ?? false
    };
  });
}

export function findProductRoutes() {
  return prisma.productRoute.findMany({
    include: includeRelations,
    orderBy: { createdAt: "desc" }
  });
}

export function findProductRouteById(id) {
  return prisma.productRoute.findUnique({
    where: { id },
    include: includeRelations
  });
}

export async function createProductRoute(data) {
  const operations = normalizeOperations(data.operations);

  return prisma.productRoute.create({
    data: {
      productId: data.productId,
      name: data.name,
      description: data.description,
      isActive: data.isActive ?? true,
      operations: {
        create: operations
      }
    },
    include: includeRelations
  });
}

export async function updateProductRoute(id, data) {
  const current = await prisma.productRoute.findUnique({ where: { id } });

  if (!current) {
    throw new ApiError(404, "Ürün rotası bulunamadı");
  }

  const operations = data.operations ? normalizeOperations(data.operations) : null;

  return prisma.$transaction(async (tx) => {
    await tx.productRoute.update({
      where: { id },
      data: {
        productId: data.productId,
        name: data.name,
        description: data.description,
        isActive: data.isActive
      }
    });

    if (operations) {
      await tx.routeOperation.deleteMany({ where: { routeId: id } });
      await tx.routeOperation.createMany({
        data: operations.map((operation) => ({
          ...operation,
          routeId: id
        }))
      });
    }

    return tx.productRoute.findUnique({
      where: { id },
      include: includeRelations
    });
  });
}
