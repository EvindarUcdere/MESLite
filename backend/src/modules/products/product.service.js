import { prisma } from "../../config/db.js";

export function findProducts() {
  return prisma.product.findMany({ orderBy: { createdAt: "desc" } });
}

export function findProductById(id) {
  return prisma.product.findUnique({ where: { id } });
}

export function createProduct(data) {
  return prisma.product.create({ data });
}

export function updateProduct(id, data) {
  return prisma.product.update({ where: { id }, data });
}
