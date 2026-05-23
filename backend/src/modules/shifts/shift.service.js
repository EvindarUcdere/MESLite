import { prisma } from "../../config/db.js";

export function findShifts() {
  return prisma.shift.findMany({ orderBy: { name: "asc" } });
}

export function findShiftById(id) {
  return prisma.shift.findUnique({ where: { id } });
}

export function createShift(data) {
  return prisma.shift.create({ data });
}

export function updateShift(id, data) {
  return prisma.shift.update({ where: { id }, data });
}
