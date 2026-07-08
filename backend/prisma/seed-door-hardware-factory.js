import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const password = "Admin123!";

const shifts = [
  { key: "S", name: "Sabah Vardiyasi", startTime: "06:00", endTime: "14:00" },
  { key: "A", name: "Aksam Vardiyasi", startTime: "14:00", endTime: "22:00" },
  { key: "G", name: "Gece Vardiyasi", startTime: "22:00", endTime: "06:00" }
];

const operatorGroups = [
  {
    name: "Kesim Ekibi",
    department: "Kesim",
    position: "Kesim Operatoru",
    machines: ["LZR-01", "PRS-01", "BKM-01"]
  },
  {
    name: "CNC Ekibi",
    department: "CNC Isleme",
    position: "CNC Operatoru",
    machines: ["CNC-01", "CNC-02", "DRL-01", "ZMP-01"]
  },
  {
    name: "Yuzey Islem Ekibi",
    department: "Yuzey Islem",
    position: "Boya ve Kaplama Operatoru",
    machines: ["ZMP-01", "BOY-01"]
  },
  {
    name: "Montaj Ekibi",
    department: "Montaj",
    position: "Montaj Operatoru",
    machines: ["MNT-01", "MNT-02", "PKT-01"]
  },
  {
    name: "Kalite Ekibi",
    department: "Kalite",
    position: "Kalite Kontrol Operatoru",
    machines: ["TST-01", "KLT-01", "KLT-02"]
  }
];

const operatorNames = [
  "Ahmet Yilmaz",
  "Ayse Demir",
  "Mehmet Kaya",
  "Zeynep Sahin",
  "Ali Celik",
  "Elif Arslan",
  "Murat Koc",
  "Fatma Aydin",
  "Emre Ozkan",
  "Seda Yildiz",
  "Caner Aksoy",
  "Derya Polat",
  "Buse Kilic",
  "Serkan Dogan",
  "Merve Aslan",
  "Burak Gunes",
  "Irem Kaplan",
  "Onur Tas",
  "Gizem Ucar",
  "Tolga Bulut",
  "Esra Cetin",
  "Kaan Yavuz",
  "Nisa Ozturk",
  "Furkan Acar",
  "Ceren Bozkurt"
];

function slugify(value) {
  return value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/(^\.|\.$)/g, "");
}

function dateOnly(date) {
  const value = new Date(date);
  value.setUTCHours(0, 0, 0, 0);
  return value;
}

function addDays(date, amount) {
  const value = new Date(date);
  value.setUTCDate(value.getUTCDate() + amount);
  return value;
}

function addMinutes(date, amount) {
  return new Date(date.getTime() + amount * 60000);
}

function monthStart(offset = 0) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
}

function daysInMonth(start) {
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
}

async function cleanupDemoData() {
  await prisma.notification.deleteMany({});
  await prisma.mobileDebugLog.deleteMany({});
  await prisma.productionAlertEvent.deleteMany({});
  await prisma.productionAlert.deleteMany({});
  await prisma.productionLogAttachment.deleteMany({});
  await prisma.scrapLot.deleteMany({});
  await prisma.productionLog.deleteMany({});
  await prisma.qualityCheck.deleteMany({});
  await prisma.operationMessage.deleteMany({});
  await prisma.operationDowntime.deleteMany({});
  await prisma.workOrderOperation.deleteMany({});
  await prisma.workOrder.deleteMany({});
  await prisma.salesOrderItem.deleteMany({});
  await prisma.salesOrder.deleteMany({});
  await prisma.machineStatusLog.deleteMany({});
  await prisma.shiftAssignment.deleteMany({});
  await prisma.operatorMachineSkill.deleteMany({});
  await prisma.shiftTemplate.deleteMany({});
  await prisma.operatorGroupMember.deleteMany({});
  await prisma.operatorGroup.deleteMany({});
  await prisma.shift.deleteMany({});
  await prisma.routeOperation.deleteMany({});
  await prisma.productRoute.deleteMany({});
  await prisma.stockMovement.deleteMany({});
  await prisma.stockItem.deleteMany({});
  await prisma.productBomItem.deleteMany({});
  await prisma.machine.deleteMany({});
  await prisma.productionLine.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.domainEventLog.deleteMany({});
}

async function upsertUser({ name, email, role, isActive = true, profile = {} }) {
  const passwordHash = await bcrypt.hash(password, 10);

  return prisma.user.upsert({
    where: { email },
    update: { name, role, isActive, passwordHash, ...profile },
    create: { name, email, role, isActive, passwordHash, ...profile }
  });
}

async function seedUsers() {
  const admin = await upsertUser({
    name: "MES Lite Admin",
    email: "admin@meslite.local",
    role: "ADMIN",
    profile: {
      employeeCode: "ADM-0001",
      department: "Bilgi Sistemleri",
      position: "Sistem Yoneticisi",
      phone: "+90 555 100 00 01"
    }
  });

  await upsertUser({
    name: "Planlama Uzmani Deniz Aksoy",
    email: "planner@meslite.local",
    role: "PLANNER",
    profile: {
      employeeCode: "PLN-0001",
      department: "Uretim Planlama",
      position: "Planlama Uzmani",
      phone: "+90 555 100 00 05"
    }
  });

  const manager = await upsertUser({
    name: "Uretim Muduru Selim Arda",
    email: "manager@meslite.local",
    role: "PRODUCTION_MANAGER",
    profile: {
      employeeCode: "MNG-0001",
      department: "Uretim",
      position: "Uretim Muduru",
      phone: "+90 555 100 00 06"
    }
  });

  const qualityStaff = await upsertUser({
    name: "Kalite Sorumlusu Ebru Kaya",
    email: "quality@meslite.local",
    role: "QUALITY_STAFF",
    profile: {
      employeeCode: "QLT-0001",
      department: "Kalite",
      position: "Kalite Sorumlusu",
      phone: "+90 555 100 00 07"
    }
  });

  await upsertUser({
    name: "Yonetim Gozlemcisi",
    email: "viewer@meslite.local",
    role: "VIEWER",
    profile: {
      employeeCode: "VIEW-0001",
      department: "Yonetim",
      position: "Izleyici",
      phone: "+90 555 100 00 08"
    }
  });

  const operators = [];
  for (let index = 0; index < operatorNames.length; index += 1) {
    const group = operatorGroups[index % operatorGroups.length];
    const name = operatorNames[index];
    operators.push(
      await upsertUser({
        name,
        email: index === 0 ? "operator@meslite.local" : `op${String(index + 1).padStart(2, "0")}.${slugify(name)}@meslite.local`,
        role: "OPERATOR",
        profile: {
          employeeCode: `OPR-${String(index + 1).padStart(4, "0")}`,
          phone: `+90 5${30 + (index % 40)} ${String(100 + index).padStart(3, "0")} ${String(20 + index).padStart(2, "0")} ${String(10 + index).padStart(2, "0")}`,
          department: group.department,
          position: group.position,
          hireDate: new Date(Date.UTC(2022 + (index % 3), index % 12, 1 + (index % 20))),
          emergencyContactName: `Acil Kisi ${index + 1}`,
          emergencyContactPhone: `+90 5${50 + (index % 30)} ${String(200 + index).padStart(3, "0")} ${String(40 + index).padStart(2, "0")} ${String(30 + index).padStart(2, "0")}`
        }
      })
    );
  }

  return { admin, manager, qualityStaff, operators };
}

async function seedMasterData() {
  const lineInputs = [
    { name: "Kesim ve Form Hatti", description: "Lazer kesim, pres ve abkant operasyonlari" },
    { name: "CNC ve Delik Isleme Hatti", description: "Kapi kolu govdesi icin CNC, delik delme ve zimpara" },
    { name: "Yuzey Islem Hatti", description: "Zimpara, kaplama ve elektrostatik boya" },
    { name: "Montaj ve Paketleme Hatti", description: "Mekanizma montaji, vida seti, rozet ve paketleme" },
    { name: "Kalite Laboratuvari", description: "Olcu, fonksiyon ve final kalite kontrolleri" }
  ];

  const lines = {};
  for (const input of lineInputs) {
    lines[input.name] = await prisma.productionLine.create({ data: input });
  }

  const machineInputs = [
    ["LZR-01", "Fiber Lazer Kesim", "Kesim ve Form Hatti"],
    ["PRS-01", "Eksantrik Pres 160T", "Kesim ve Form Hatti"],
    ["BKM-01", "Abkant Bukum", "Kesim ve Form Hatti"],
    ["CNC-01", "CNC Isleme Merkezi 1", "CNC ve Delik Isleme Hatti"],
    ["CNC-02", "CNC Isleme Merkezi 2", "CNC ve Delik Isleme Hatti"],
    ["DRL-01", "Delik Delme ve Havsa Istasyonu", "CNC ve Delik Isleme Hatti"],
    ["ZMP-01", "Zimpara ve Capak Alma Hatti", "Yuzey Islem Hatti"],
    ["BOY-01", "Elektrostatik Boya Kabini", "Yuzey Islem Hatti"],
    ["MNT-01", "Kapi Kolu Montaj Istasyonu", "Montaj ve Paketleme Hatti"],
    ["MNT-02", "Menteshe ve Kilit Montaj Istasyonu", "Montaj ve Paketleme Hatti"],
    ["TST-01", "Fonksiyon Test Standi", "Kalite Laboratuvari"],
    ["KLT-01", "Olcu Kontrol Masasi", "Kalite Laboratuvari"],
    ["KLT-02", "Final Kalite Masasi", "Kalite Laboratuvari"],
    ["PKT-01", "Paketleme ve Etiketleme", "Montaj ve Paketleme Hatti"]
  ];

  const machines = {};
  for (const [code, name, lineName] of machineInputs) {
    machines[code] = await prisma.machine.create({
      data: {
        code,
        name,
        productionLineId: lines[lineName].id,
        status: code === "CNC-02" ? "MAINTENANCE" : code === "MNT-01" ? "RUNNING" : "IDLE"
      }
    });
  }

  const productInputs = [
    ["PRD-KPK-100", "Aluminyum Kapi Kolu", "adet", 48],
    ["PRD-KPK-200", "Paslanmaz Kapi Kolu", "adet", 62],
    ["PRD-KLT-300", "Kilit Karsilik Saci", "adet", 28],
    ["PRD-MNT-400", "Menteshe Seti", "set", 38],
    ["PRD-ROZ-500", "Kapi Kolu Rozeti", "adet", 24],
    ["CMP-ALU-6061", "Aluminyum Profil 6061", "kg", null],
    ["CMP-INOX-304", "Paslanmaz Sac 304", "kg", null],
    ["CMP-ZAMAK", "Zamak Dokum Govde", "adet", null],
    ["CMP-VIDA-M5", "M5 Vida Seti", "set", null],
    ["CMP-YAY", "Yay Mekanizmasi", "adet", null],
    ["CMP-BOYA-SIYAH", "Siyah Elektrostatik Boya", "kg", null],
    ["CMP-ETIKET", "Urun Etiketi", "adet", null],
    ["CMP-KOLI", "Kapi Donanimi Kolisi", "adet", null]
  ];

  const products = {};
  for (const [code, name, unit, targetCycleTime] of productInputs) {
    products[code] = await prisma.product.create({ data: { code, name, unit, targetCycleTime } });
  }

  const shiftMap = {};
  for (const input of shifts) {
    shiftMap[input.key] = await prisma.shift.create({
      data: { name: input.name, startTime: input.startTime, endTime: input.endTime }
    });
  }

  return { lines, machines, products, shifts: shiftMap };
}

async function seedBomAndInventory({ products, admin }) {
  const bomDefinitions = [
    ["PRD-KPK-100", [["CMP-ALU-6061", 0.85, "kg", 3], ["CMP-VIDA-M5", 1, "set", 1], ["CMP-YAY", 1, "adet", 1], ["CMP-BOYA-SIYAH", 0.035, "kg", 2], ["CMP-ETIKET", 1, "adet", 0], ["CMP-KOLI", 0.5, "adet", 0]]],
    ["PRD-KPK-200", [["CMP-INOX-304", 1.1, "kg", 4], ["CMP-VIDA-M5", 1, "set", 1], ["CMP-YAY", 1, "adet", 1], ["CMP-ETIKET", 1, "adet", 0], ["CMP-KOLI", 0.5, "adet", 0]]],
    ["PRD-KLT-300", [["CMP-INOX-304", 0.32, "kg", 5], ["CMP-ETIKET", 1, "adet", 0]]],
    ["PRD-MNT-400", [["CMP-INOX-304", 0.7, "kg", 4], ["CMP-VIDA-M5", 2, "set", 1], ["CMP-ETIKET", 1, "adet", 0], ["CMP-KOLI", 1, "adet", 0]]],
    ["PRD-ROZ-500", [["CMP-ZAMAK", 1, "adet", 2], ["CMP-BOYA-SIYAH", 0.02, "kg", 2], ["CMP-ETIKET", 1, "adet", 0]]]
  ];

  for (const [productCode, items] of bomDefinitions) {
    await prisma.productBomItem.createMany({
      data: items.map(([componentCode, quantity, unit, wastePercent]) => ({
        productId: products[productCode].id,
        componentProductId: products[componentCode].id,
        quantity,
        unit,
        wastePercent,
        note: "Kapi donanimi standart recetesi"
      }))
    });
  }

  const stockDefinitions = [
    ["CMP-ALU-6061", 920, 240, "Hammadde Deposu / Aluminyum Profil Rafi"],
    ["CMP-INOX-304", 760, 220, "Hammadde Deposu / Paslanmaz Sac Rafi"],
    ["CMP-ZAMAK", 1800, 450, "Dokum Govde Deposu"],
    ["CMP-VIDA-M5", 2600, 700, "Montaj Deposu / Vida Raflari"],
    ["CMP-YAY", 2100, 500, "Montaj Deposu / Mekanizma Kutulari"],
    ["CMP-BOYA-SIYAH", 240, 60, "Boya Deposu / Siyah Toz Boya"],
    ["CMP-ETIKET", 5000, 1000, "Paketleme / Etiket Rafi"],
    ["CMP-KOLI", 1100, 250, "Paketleme / Koli Alani"],
    ["PRD-KPK-100", 90, 30, "Bitmis Urun Deposu"],
    ["PRD-KPK-200", 64, 25, "Bitmis Urun Deposu"],
    ["PRD-KLT-300", 220, 80, "Bitmis Urun Deposu"],
    ["PRD-MNT-400", 120, 40, "Bitmis Urun Deposu"],
    ["PRD-ROZ-500", 260, 90, "Bitmis Urun Deposu"]
  ];

  for (const [productCode, quantityOnHand, minimumQuantity, location] of stockDefinitions) {
    const stockItem = await prisma.stockItem.create({
      data: {
        productId: products[productCode].id,
        quantityOnHand,
        minimumQuantity,
        location
      }
    });

    await prisma.stockMovement.create({
      data: {
        stockItemId: stockItem.id,
        productId: products[productCode].id,
        type: productCode.startsWith("CMP-") ? "PURCHASE_IN" : "PRODUCTION_IN",
        quantity: quantityOnHand,
        balanceAfter: quantityOnHand,
        referenceType: "FACTORY_SEED",
        referenceId: "DOOR_HARDWARE_FACTORY_PROFILE",
        note: productCode.startsWith("CMP-") ? "Baslangic hammadde stogu" : "Baslangic bitmis urun stogu",
        createdById: admin.id
      }
    });
  }
}

async function seedRoutes({ products, machines }) {
  const definitions = [
    {
      product: products["PRD-KPK-100"],
      name: "Aluminyum Kapi Kolu Rotasi",
      operations: [
        ["Profil Kesim", "LZR-01", 26, false],
        ["CNC Isleme", "CNC-01", 46, false],
        ["Delik Delme ve Havsa", "DRL-01", 22, false],
        ["Zimpara ve Capak Alma", "ZMP-01", 34, false],
        ["Elektrostatik Boya", "BOY-01", 58, false],
        ["Mekanizma Montaj", "MNT-01", 42, false],
        ["Fonksiyon Test", "TST-01", 18, true],
        ["Final Kalite", "KLT-02", 16, true],
        ["Paketleme", "PKT-01", 14, false]
      ]
    },
    {
      product: products["PRD-KPK-200"],
      name: "Paslanmaz Kapi Kolu Rotasi",
      operations: [
        ["Sac Kesim", "LZR-01", 30, false],
        ["CNC Isleme", "CNC-02", 56, false],
        ["Delik Delme ve Havsa", "DRL-01", 24, false],
        ["Zimpara ve Polisaj", "ZMP-01", 48, false],
        ["Mekanizma Montaj", "MNT-01", 44, false],
        ["Fonksiyon Test", "TST-01", 20, true],
        ["Final Kalite", "KLT-02", 18, true],
        ["Paketleme", "PKT-01", 16, false]
      ]
    },
    {
      product: products["PRD-KLT-300"],
      name: "Kilit Karsilik Saci Rotasi",
      operations: [
        ["Lazer Kesim", "LZR-01", 20, false],
        ["Abkant Bukum", "BKM-01", 24, false],
        ["Capak Alma", "ZMP-01", 18, false],
        ["Olcu Kontrol", "KLT-01", 14, true],
        ["Paketleme", "PKT-01", 12, false]
      ]
    },
    {
      product: products["PRD-MNT-400"],
      name: "Menteshe Seti Rotasi",
      operations: [
        ["Sac Kesim", "LZR-01", 24, false],
        ["Presleme", "PRS-01", 30, false],
        ["Delik Delme", "DRL-01", 18, false],
        ["Pim ve Vida Montaj", "MNT-02", 36, false],
        ["Fonksiyon Test", "TST-01", 16, true],
        ["Final Kalite", "KLT-02", 14, true],
        ["Paketleme", "PKT-01", 14, false]
      ]
    },
    {
      product: products["PRD-ROZ-500"],
      name: "Kapi Kolu Rozeti Rotasi",
      operations: [
        ["Presleme", "PRS-01", 22, false],
        ["Delik Delme", "DRL-01", 16, false],
        ["Zimpara ve Capak Alma", "ZMP-01", 20, false],
        ["Elektrostatik Boya", "BOY-01", 46, false],
        ["Olcu Kontrol", "KLT-01", 14, true],
        ["Paketleme", "PKT-01", 12, false]
      ]
    }
  ];

  const routes = [];
  for (const definition of definitions) {
    const route = await prisma.productRoute.create({
      data: {
        productId: definition.product.id,
        name: definition.name,
        description: "Kapi donanimi fabrikasi icin standart operasyon akisi"
      }
    });

    const operations = [];
    for (let index = 0; index < definition.operations.length; index += 1) {
      const [operationName, machineCode, estimatedMinutes, requiresQualityCheck] = definition.operations[index];
      operations.push(
        await prisma.routeOperation.create({
          data: {
            routeId: route.id,
            operationName,
            sequenceNo: index + 1,
            defaultMachineId: machines[machineCode].id,
            estimatedMinutes,
            requiresQualityCheck
          }
        })
      );
    }

    routes.push({ route, product: definition.product, operations });
  }

  return routes;
}

async function seedGroupsSkillsAndRoster({ operators, machines, shifts: shiftMap }) {
  const groups = {};
  for (let groupIndex = 0; groupIndex < operatorGroups.length; groupIndex += 1) {
    const definition = operatorGroups[groupIndex];
    const group = await prisma.operatorGroup.create({
      data: {
        name: definition.name,
        description: `${definition.name} icin otomatik vardiya ve makine yetkinligi grubu`
      }
    });
    groups[definition.name] = group;

    const members = operators.filter((_, index) => index % operatorGroups.length === groupIndex);
    await prisma.operatorGroupMember.createMany({
      data: members.map((operator) => ({ groupId: group.id, operatorId: operator.id }))
    });

    const skillRows = [];
    members.forEach((operator, operatorIndex) => {
      definition.machines.forEach((machineCode, machineIndex) => {
        skillRows.push({
          operatorId: operator.id,
          machineId: machines[machineCode].id,
          level: operatorIndex % 3 === 0 || machineIndex === 0 ? "CERTIFIED" : operatorIndex % 2 === 0 ? "ADVANCED" : "BASIC",
          note: `${definition.name} standart yetkinligi`
        });
      });
    });
    await prisma.operatorMachineSkill.createMany({ data: skillRows });
  }

  const shiftKeys = ["S", "A", "G"];
  const assignments = [];
  for (let monthOffset = 0; monthOffset < 2; monthOffset += 1) {
    const start = monthStart(monthOffset);
    const monthDayCount = daysInMonth(start);

    for (let day = 1; day <= monthDayCount; day += 1) {
      const workDate = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), day));
      const isSunday = workDate.getUTCDay() === 0;

      operators.forEach((operator, operatorIndex) => {
        const teamMemberIndex = Math.floor(operatorIndex / operatorGroups.length);
        const shiftKey = shiftKeys[(teamMemberIndex + Math.floor((day - 1) / 7)) % shiftKeys.length];
        assignments.push({
          operatorId: operator.id,
          shiftId: shiftMap[shiftKey].id,
          workDate,
          startTime: shiftMap[shiftKey].startTime,
          endTime: shiftMap[shiftKey].endTime,
          status: isSunday ? "LEAVE" : "CONFIRMED",
          note: isSunday ? "Haftalik izin" : `${monthOffset === 0 ? "Bu ay" : "Gelecek ay"} otomatik vardiya`
        });
      });
    }
  }

  await prisma.shiftAssignment.createMany({ data: assignments });

  for (const [index, definition] of operatorGroups.entries()) {
    await prisma.shiftTemplate.create({
      data: {
        name: `${definition.name} 6 Gunluk Dongu`,
        description: "Haftada 6 gun calisan ekip icin otomatik aylik plan sablonu",
        pattern: "SIX_DAYS",
        shiftId: shiftMap[shiftKeys[index % shiftKeys.length]].id,
        groupId: groups[definition.name].id,
        startOffset: index
      }
    });
  }

  return groups;
}

function pickOperatorForMachine(machineCode, operators) {
  const groupIndexByMachine = {
    LZR: 0,
    PRS: 0,
    BKM: 0,
    CNC: 1,
    DRL: 1,
    ZMP: 2,
    BOY: 2,
    MNT: 3,
    PKT: 3,
    TST: 4,
    KLT: 4
  };
  const prefix = machineCode.split("-")[0];
  const groupIndex = groupIndexByMachine[prefix] ?? 0;
  const pool = operators.filter((_, index) => index % operatorGroups.length === groupIndex);
  return pool[Math.floor(Math.random() * pool.length)] ?? operators[0];
}

async function createWorkOrderScenario({ orderNo, routePack, operators, shifts: shiftMap, manager, qualityStaff, dayOffset, status, plannedQuantity, progressRatio = 1 }) {
  const plannedStartDate = addDays(dateOnly(new Date()), dayOffset);
  const routeMinutes = routePack.operations.reduce((sum, operation) => sum + (operation.estimatedMinutes ?? 30), 0);
  const plannedEndDate = addMinutes(plannedStartDate, routeMinutes);
  const actualStartDate = status === "PLANNED" ? null : addMinutes(plannedStartDate, 12);
  const actualEndDate = status === "COMPLETED" ? addMinutes(actualStartDate, routeMinutes + 24) : null;

  const workOrder = await prisma.workOrder.create({
    data: {
      orderNo,
      productId: routePack.product.id,
      routeId: routePack.route.id,
      plannedQuantity,
      status,
      plannedStartDate,
      plannedEndDate,
      actualStartDate,
      actualEndDate,
      createdById: manager.id
    }
  });

  const completedOperationCount = status === "COMPLETED" ? routePack.operations.length : status === "PLANNED" ? 0 : Math.max(1, Math.floor(routePack.operations.length * progressRatio));
  let transferredQuantity = plannedQuantity;
  let operationScrapTotal = 0;
  const operations = [];

  for (let index = 0; index < routePack.operations.length; index += 1) {
    const routeOperation = routePack.operations[index];
    const machine = await prisma.machine.findUnique({ where: { id: routeOperation.defaultMachineId } });
    const operator = pickOperatorForMachine(machine.code, operators);
    const isCompleted = index < completedOperationCount;
    const isCurrent = status !== "COMPLETED" && status !== "PLANNED" && index === completedOperationCount;
    const operationStatus = isCompleted ? "COMPLETED" : isCurrent ? (status === "PAUSED" ? "PAUSED" : "IN_PROGRESS") : index === 0 || index === completedOperationCount ? "READY" : "WAITING";
    const operationScrap = isCompleted && index % 4 === 1 ? 1 + (index % 2) : 0;
    const operationGood = isCompleted ? Math.max(transferredQuantity - operationScrap, 0) : 0;
    const startedAt = operationStatus === "WAITING" || operationStatus === "READY" ? null : addMinutes(plannedStartDate, index * 70 + 10);
    const completedAt = operationStatus === "COMPLETED" && startedAt ? addMinutes(startedAt, routeOperation.estimatedMinutes ?? 30) : null;

    const operation = await prisma.workOrderOperation.create({
      data: {
        workOrderId: workOrder.id,
        routeOperationId: routeOperation.id,
        machineId: routeOperation.defaultMachineId,
        assignedOperatorId: operator.id,
        sequenceNo: routeOperation.sequenceNo,
        operationName: routeOperation.operationName,
        status: operationStatus,
        producedQuantity: operationGood,
        scrapQuantity: operationScrap,
        startedAt,
        completedAt
      }
    });

    operations.push({ operation, operator, machine, routeOperation, operationGood, operationScrap, startedAt, completedAt });
    operationScrapTotal += operationScrap;

    if (operationStatus === "COMPLETED" || operationStatus === "PAUSED" || operationStatus === "IN_PROGRESS") {
      await prisma.productionLog.create({
        data: {
          workOrderId: workOrder.id,
          workOrderOperationId: operation.id,
          operatorId: operator.id,
          machineId: routeOperation.defaultMachineId,
          shiftId: shiftMap[index % 3 === 0 ? "S" : index % 3 === 1 ? "A" : "G"].id,
          producedQuantity: operationGood,
          scrapQuantity: operationScrap,
          scrapReason: operationScrap ? "PROCESS_DEVIATION" : null,
          scrapDisposition: operationScrap ? "PENDING_REVIEW" : null,
          startedAt,
          endedAt: completedAt,
          note: operationStatus === "PAUSED" ? "Operasyon duraklatildi, uretim tekrar baslatilabilir." : `${routeOperation.operationName} uretim kaydi`
        }
      });
    }

    if (operationStatus === "PAUSED") {
      await prisma.operationDowntime.create({
        data: {
          workOrderId: workOrder.id,
          workOrderOperationId: operation.id,
          machineId: routeOperation.defaultMachineId,
          operatorId: operator.id,
          shiftId: shiftMap.A.id,
          reason: "MATERIAL_WAITING",
          note: "Kapi kolu mekanizma parcasi bekleniyor.",
          startedAt: addMinutes(startedAt ?? plannedStartDate, 20),
          endedAt: null
        }
      });
    }

    if (isCompleted && routeOperation.requiresQualityCheck) {
      const defectQuantity = index % 3 === 0 ? 0 : 1;
      await prisma.qualityCheck.create({
        data: {
          workOrderId: workOrder.id,
          workOrderOperationId: operation.id,
          checkedById: qualityStaff.id,
          status: defectQuantity ? "PARTIAL" : "PASSED",
          defectQuantity,
          defectReason: defectQuantity ? "Yuzey cizigi" : null,
          note: defectQuantity ? "Kismi kabul, fire karantina alanina ayrildi." : "Olcum ve fonksiyon kontrolu uygun.",
          checkedAt: completedAt ?? new Date()
        }
      });
    }

    transferredQuantity = operationGood || transferredQuantity;
  }

  await prisma.workOrder.update({
    where: { id: workOrder.id },
    data: {
      machineId: operations[0]?.machine.id,
      assignedOperatorId: operations[0]?.operator.id,
      producedQuantity: operations.at(-1)?.operation.producedQuantity ?? 0,
      scrapQuantity: operationScrapTotal
    }
  });

  return workOrder;
}

async function seedWorkOrders({ routes, operators, shifts: shiftMap, manager, qualityStaff }) {
  const scenarios = [];
  for (let index = 0; index < 18; index += 1) {
    scenarios.push({
      orderNo: `DOOR-2026-07-${String(index + 1).padStart(3, "0")}`,
      routePack: routes[index % routes.length],
      dayOffset: -14 + index,
      status: index < 12 ? "COMPLETED" : index % 2 === 0 ? "IN_PROGRESS" : "PAUSED",
      plannedQuantity: 80 + (index % 5) * 30,
      progressRatio: index < 12 ? 1 : 0.35 + (index % 3) * 0.18
    });
  }

  for (let index = 0; index < 8; index += 1) {
    scenarios.push({
      orderNo: `DOOR-2026-08-${String(index + 1).padStart(3, "0")}`,
      routePack: routes[(index + 1) % routes.length],
      dayOffset: 6 + index * 2,
      status: "PLANNED",
      plannedQuantity: 100 + (index % 4) * 40,
      progressRatio: 0
    });
  }

  scenarios.push(
    {
      orderNo: "DOOR-DEMO-TODAY-ALU-KOL",
      routePack: routes[0],
      dayOffset: 0,
      status: "PLANNED",
      plannedQuantity: 150,
      progressRatio: 0
    },
    {
      orderNo: "DOOR-DEMO-ACTIVE-MENTESE",
      routePack: routes[3],
      dayOffset: -1,
      status: "IN_PROGRESS",
      plannedQuantity: 120,
      progressRatio: 0.45
    }
  );

  for (const scenario of scenarios) {
    await createWorkOrderScenario({ ...scenario, operators, shifts: shiftMap, manager, qualityStaff });
  }
}

async function main() {
  await cleanupDemoData();
  const { admin, manager, qualityStaff, operators } = await seedUsers();
  const masterData = await seedMasterData();
  const routes = await seedRoutes(masterData);
  await seedBomAndInventory({ products: masterData.products, admin });
  await seedGroupsSkillsAndRoster({ operators, machines: masterData.machines, shifts: masterData.shifts });
  await seedWorkOrders({ routes, operators, shifts: masterData.shifts, manager, qualityStaff });

  console.log({
    status: "ok",
    message: "Door hardware factory demo data seeded.",
    users: {
      admin: admin.email,
      manager: manager.email,
      quality: qualityStaff.email,
      operatorExample: operators[0].email,
      password
    },
    counts: {
      activeOperators: operators.length,
      products: Object.keys(masterData.products).length,
      machines: Object.keys(masterData.machines).length,
      shifts: Object.keys(masterData.shifts).length,
      routes: routes.length
    }
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
