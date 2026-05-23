import bcrypt from "bcryptjs";
import { prisma } from "../../config/db.js";

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true
};

export function findUsers() {
  return prisma.user.findMany({
    select: userSelect,
    orderBy: { createdAt: "desc" }
  });
}

export function findUserById(id) {
  return prisma.user.findUnique({
    where: { id },
    select: userSelect
  });
}

export async function createUser(data) {
  const passwordHash = await bcrypt.hash(data.password, 10);

  return prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      role: data.role,
      isActive: data.isActive,
      passwordHash
    },
    select: userSelect
  });
}

export async function updateUser(id, data) {
  const { password, ...rest } = data;
  const passwordHash = password ? await bcrypt.hash(password, 10) : undefined;

  return prisma.user.update({
    where: { id },
    data: {
      ...rest,
      ...(passwordHash ? { passwordHash } : {})
    },
    select: userSelect
  });
}

export function updateUserStatus(id, isActive) {
  return prisma.user.update({
    where: { id },
    data: { isActive },
    select: userSelect
  });
}
