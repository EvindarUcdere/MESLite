import { prisma } from "../../config/db.js";

export function findProductionLines() {
  return prisma.productionLine.findMany({
    include: { machines: true },
    orderBy: { createdAt: "desc" }
  });
}

export function findProductionLineById(id) {
  return prisma.productionLine.findUnique({
    where: { id },
    include: { machines: true }
  });
}

export function createProductionLine(data) {
  return prisma.productionLine.create({ data });
}

export function updateProductionLine(id, data) {
  return prisma.productionLine.update({ where: { id }, data });
}
