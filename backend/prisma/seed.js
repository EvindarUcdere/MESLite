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
