import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("Admin123!", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@meslite.local" },
    update: {},
    create: {
      name: "MES Lite Admin",
      email: "admin@meslite.local",
      passwordHash,
      role: "ADMIN"
    }
  });

  await prisma.user.upsert({
    where: { email: "manager@meslite.local" },
    update: {},
    create: {
      name: "Production Manager",
      email: "manager@meslite.local",
      passwordHash,
      role: "PRODUCTION_MANAGER"
    }
  });

  await prisma.user.upsert({
    where: { email: "operator@meslite.local" },
    update: {},
    create: {
      name: "Line Operator",
      email: "operator@meslite.local",
      passwordHash,
      role: "OPERATOR"
    }
  });

  await prisma.user.upsert({
    where: { email: "quality@meslite.local" },
    update: {},
    create: {
      name: "Quality Staff",
      email: "quality@meslite.local",
      passwordHash,
      role: "QUALITY_STAFF"
    }
  });

  const product = await prisma.product.upsert({
    where: { code: "PRD-001" },
    update: {},
    create: {
      code: "PRD-001",
      name: "Demo Product",
      unit: "pcs",
      targetCycleTime: 45
    }
  });

  const line = await prisma.productionLine.upsert({
    where: { name: "Line A" },
    update: {},
    create: {
      name: "Line A",
      description: "Demo assembly line"
    }
  });

  await prisma.machine.upsert({
    where: { code: "MCH-001" },
    update: {},
    create: {
      code: "MCH-001",
      name: "Assembly Machine 1",
      productionLineId: line.id
    }
  });

  await prisma.shift.upsert({
    where: { name: "Day Shift" },
    update: {},
    create: {
      name: "Day Shift",
      startTime: "08:00",
      endTime: "16:00"
    }
  });

  console.log({ admin: admin.email, product: product.code });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
