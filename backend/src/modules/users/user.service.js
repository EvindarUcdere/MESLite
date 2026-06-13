import bcrypt from "bcryptjs";
import { prisma } from "../../config/db.js";

const userSelect = {
  id: true,
  name: true,
  email: true,
  employeeCode: true,
  phone: true,
  department: true,
  position: true,
  hireDate: true,
  terminationDate: true,
  emergencyContactName: true,
  emergencyContactPhone: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true
};

const profileFields = [
  "employeeCode",
  "phone",
  "department",
  "position",
  "hireDate",
  "terminationDate",
  "emergencyContactName",
  "emergencyContactPhone"
];

function normalizeUserProfile(data) {
  const profile = {};

  for (const field of profileFields) {
    if (data[field] !== undefined) {
      profile[field] = data[field] === "" ? null : data[field];
    }
  }

  if (profile.hireDate) {
    profile.hireDate = new Date(profile.hireDate);
  }

  if (profile.terminationDate) {
    profile.terminationDate = new Date(profile.terminationDate);
  }

  return profile;
}

function normalizeEmail(email) {
  return email.trim().toLocaleLowerCase("tr-TR");
}

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
  const temporaryPassword = data.password.trim();
  const passwordHash = await bcrypt.hash(temporaryPassword, 10);
  const email = normalizeEmail(data.email);

  const user = await prisma.user.create({
    data: {
      name: data.name,
      email,
      role: data.role,
      isActive: data.isActive,
      ...normalizeUserProfile(data),
      passwordHash
    },
    select: userSelect
  });

  return {
    ...user,
    temporaryPassword
  };
}

export async function updateUser(id, data) {
  const { password, ...rest } = data;
  const temporaryPassword = password ? password.trim() : undefined;
  const passwordHash = temporaryPassword ? await bcrypt.hash(temporaryPassword, 10) : undefined;
  const profile = normalizeUserProfile(rest);
  const normalizedRest = {
    ...rest,
    ...(rest.email ? { email: normalizeEmail(rest.email) } : {})
  };

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...normalizedRest,
      ...profile,
      ...(passwordHash ? { passwordHash } : {})
    },
    select: userSelect
  });

  return {
    ...user,
    ...(temporaryPassword ? { temporaryPassword } : {})
  };
}

export function updateUserStatus(id, isActive) {
  return prisma.user.update({
    where: { id },
    data: { isActive },
    select: userSelect
  });
}
