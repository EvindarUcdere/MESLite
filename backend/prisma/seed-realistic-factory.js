import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const password = "Admin123!";

const tr = {
  groups: ["Kesim Ekibi", "CNC Ekibi", "Kaynak Ekibi", "Montaj Ekibi", "Kalite Ekibi"],
  shifts: [
    { key: "S", name: "Sabah Vardiyası", startTime: "06:00", endTime: "14:00" },
    { key: "A", name: "Akşam Vardiyası", startTime: "14:00", endTime: "22:00" },
    { key: "G", name: "Gece Vardiyası", startTime: "22:00", endTime: "06:00" }
  ]
};

const operatorNames = [
  "Ahmet Yılmaz",
  "Ayşe Demir",
  "Mehmet Kaya",
  "Zeynep Şahin",
  "Ali Çelik",
  "Elif Arslan",
  "Murat Koç",
  "Fatma Aydın",
  "Emre Özkan",
  "Hakan Kurt",
  "Seda Yıldız",
  "Caner Aksoy",
  "Derya Polat",
  "Oğuzhan Eren",
  "Buse Kılıç",
  "Serkan Doğan",
  "Merve Aslan",
  "Burak Güneş",
  "İrem Kaplan",
  "Onur Taş",
  "Gizem Uçar",
  "Tolga Bulut",
  "Esra Çetin",
  "Kaan Yavuz",
  "Nisa Öztürk",
  "Furkan Acar",
  "Ceren Bozkurt",
  "Yasin Tekin",
  "Selin Avcı",
  "Barış Karaca",
  "Ece Korkmaz",
  "Umut Çakır",
  "Nazlı Erdem",
  "Kerem Yüce",
  "Dilara Tunç",
  "Sinan Özdemir",
  "Sibel Uslu",
  "Eren Sezer",
  "Pelin Yalçın",
  "Tuna Başar",
  "Melis Sarı",
  "Berkay Çoban",
  "Rabia Işık",
  "Volkan Ekinci",
  "Damla Keskin",
  "Kadir Önal",
  "Şule Mercan",
  "Deniz Gür",
  "Aylin Soylu",
  "Cem Yıldırım"
];

const formerOperatorNames = ["Orhan Keleş", "Gül Tuncer", "Harun Bilgin", "Betül Efe", "Levent Pak", "Suna Oral", "Yelda Yaman", "Metin Topal"];

function slugify(value) {
  return value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ı/g, "i")
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

async function cleanupOperationalData() {
  await prisma.notification.deleteMany({});
  await prisma.mobileDebugLog.deleteMany({});
  await prisma.productionAlertEvent.deleteMany({});
  await prisma.productionAlert.deleteMany({});
  await prisma.productionLogAttachment.deleteMany({});
  await prisma.productionLog.deleteMany({});
  await prisma.qualityCheck.deleteMany({});
  await prisma.operationMessage.deleteMany({});
  await prisma.operationDowntime.deleteMany({});
  await prisma.workOrderOperation.deleteMany({});
  await prisma.workOrder.deleteMany({});
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
}

const departmentByGroup = ["Kesim", "CNC İşleme", "Kaynak", "Montaj", "Kalite"];
const positionByGroup = ["Kesim Operatörü", "CNC Operatörü", "Kaynak Operatörü", "Montaj Operatörü", "Kalite Kontrol Operatörü"];

function userProfile(index, groupIndex, isActive = true) {
  const hireDate = new Date(Date.UTC(2021 + (index % 4), index % 12, 1 + (index % 20)));
  const terminationDate = isActive ? null : new Date(Date.UTC(2026, 4, 20 + (index % 8)));

  return {
    employeeCode: `${isActive ? "EMP" : "OLD"}-${String(index + 1).padStart(4, "0")}`,
    phone: `+90 5${30 + (index % 40)} ${String(100 + index).padStart(3, "0")} ${String(20 + index).padStart(2, "0")} ${String(10 + index).padStart(2, "0")}`,
    department: departmentByGroup[groupIndex] ?? "Üretim",
    position: positionByGroup[groupIndex] ?? "Operatör",
    hireDate,
    terminationDate,
    emergencyContactName: `Acil Kişi ${index + 1}`,
    emergencyContactPhone: `+90 5${50 + (index % 30)} ${String(200 + index).padStart(3, "0")} ${String(40 + index).padStart(2, "0")} ${String(30 + index).padStart(2, "0")}`
  };
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
  await prisma.user.updateMany({
    where: { role: "OPERATOR" },
    data: { isActive: false }
  });

  const admin = await upsertUser({ name: "MES Lite Admin", email: "admin@meslite.local", role: "ADMIN", profile: { employeeCode: "ADM-0001", department: "Bilgi Sistemleri", position: "Sistem Yöneticisi", phone: "+90 555 100 00 01" } });
  await upsertUser({ name: "Planlama Uzmanı Deniz Aksoy", email: "planner@meslite.local", role: "PLANNER", profile: { employeeCode: "PLN-0001", department: "Üretim Planlama", position: "Planlama Uzmanı", phone: "+90 555 100 00 05" } });
  const manager = await upsertUser({ name: "Üretim Müdürü Selim Arda", email: "manager@meslite.local", role: "PRODUCTION_MANAGER" });
  const qualityStaff = await upsertUser({ name: "Kalite Sorumlusu Ebru Kaya", email: "quality@meslite.local", role: "QUALITY_STAFF" });
  await upsertUser({ name: "Yönetim Gözlemcisi", email: "viewer@meslite.local", role: "VIEWER" });

  await upsertUser({
    name: "Line Operator",
    email: "operator@meslite.local",
    role: "OPERATOR",
    profile: {
      employeeCode: "EMP-DEMO-LINE",
      phone: "+90 555 100 00 10",
      department: "Kesim",
      position: "Hat Operatörü",
      hireDate: new Date(Date.UTC(2024, 0, 15)),
      emergencyContactName: "Demo Acil Kişi",
      emergencyContactPhone: "+90 555 200 00 10"
    }
  });

  const operators = [];
  for (let index = 0; index < operatorNames.length; index += 1) {
    const name = operatorNames[index];
    const email = `op${String(index + 1).padStart(2, "0")}.${slugify(name)}@meslite.local`;
    operators.push(await upsertUser({ name, email, role: "OPERATOR", profile: userProfile(index, Math.floor(index / 10), true) }));
  }

  for (let index = 0; index < formerOperatorNames.length; index += 1) {
    const name = formerOperatorNames[index];
    const email = `former${String(index + 1).padStart(2, "0")}.${slugify(name)}@meslite.local`;
    await upsertUser({ name, email, role: "OPERATOR", isActive: false, profile: userProfile(index, index % 5, false) });
  }

  return { admin, manager, qualityStaff, operators };
}

async function seedFactoryMasterData() {
  const lineInputs = [
    { name: "Pres ve Kesim Hattı", description: "Sac kesim, pres ve form verme operasyonları" },
    { name: "CNC İşleme Hattı", description: "CNC tornalama ve frezeleme operasyonları" },
    { name: "Kaynak ve Montaj Hattı", description: "Robot kaynak, manuel montaj ve tork kontrolü" },
    { name: "Boya ve Paketleme Hattı", description: "Yüzey işlem, etiketleme ve sevk hazırlığı" },
    { name: "Kalite Laboratuvarı", description: "Ölçüm, fonksiyon ve final kalite kontrolleri" }
  ];

  const lines = {};
  for (const input of lineInputs) {
    lines[input.name] = await prisma.productionLine.create({ data: input });
  }

  const machineInputs = [
    ["PRS-01", "Servo Pres 250T", "Pres ve Kesim Hattı"],
    ["LZR-01", "Fiber Lazer Kesim", "Pres ve Kesim Hattı"],
    ["BKM-01", "Abkant Büküm", "Pres ve Kesim Hattı"],
    ["CNC-01", "CNC Torna 1", "CNC İşleme Hattı"],
    ["CNC-02", "CNC Freze 1", "CNC İşleme Hattı"],
    ["DRL-01", "Delik Delme İstasyonu", "CNC İşleme Hattı"],
    ["KYN-01", "Robot Kaynak Hücresi", "Kaynak ve Montaj Hattı"],
    ["MNT-01", "Manuel Montaj İstasyonu 1", "Kaynak ve Montaj Hattı"],
    ["MNT-02", "Manuel Montaj İstasyonu 2", "Kaynak ve Montaj Hattı"],
    ["TST-01", "Fonksiyon Test Standı", "Kalite Laboratuvarı"],
    ["KLT-01", "3D Ölçüm Masası", "Kalite Laboratuvarı"],
    ["KLT-02", "Final Kontrol Masası", "Kalite Laboratuvarı"],
    ["BOY-01", "Toz Boya Kabini", "Boya ve Paketleme Hattı"],
    ["PKT-01", "Paketleme ve Etiketleme", "Boya ve Paketleme Hattı"]
  ];

  const machines = {};
  for (const [code, name, lineName] of machineInputs) {
    machines[code] = await prisma.machine.create({
      data: {
        code,
        name,
        productionLineId: lines[lineName].id,
        status: code === "CNC-02" ? "MAINTENANCE" : code === "KYN-01" ? "RUNNING" : "IDLE"
      }
    });
  }

  const productInputs = [
    ["PRD-HVG-001", "Hidrolik Valf Gövdesi", "adet", 75],
    ["PRD-AMB-120", "Ambalajlı Final Modül", "adet", 60],
    ["PRD-BRK-045", "Bağlantı Braketi", "adet", 40],
    ["PRD-MTK-210", "Motor Kapak Seti", "adet", 55],
    ["PRD-KPN-330", "Kontrol Panel Kutusu", "adet", 90],
    ["CMP-SAC-2MM", "2 mm DKP Sac Levha", "kg", null],
    ["CMP-SAC-3MM", "3 mm DKP Sac Levha", "kg", null],
    ["CMP-ALU-6061", "Alüminyum 6061 Blok", "kg", null],
    ["CMP-VALF-KIT", "Valf Conta ve Yay Kiti", "set", null],
    ["CMP-CIV-M6", "M6 Civata Seti", "set", null],
    ["CMP-BOYA-GRI", "Gri Toz Boya", "kg", null],
    ["CMP-ETIKET", "Ürün Etiketi", "adet", null],
    ["CMP-KOLI", "Sevk Kolisi", "adet", null]
  ];

  const products = {};
  for (const [code, name, unit, targetCycleTime] of productInputs) {
    products[code] = await prisma.product.create({
      data: { code, name, unit, targetCycleTime }
    });
  }

  const shifts = {};
  for (const input of tr.shifts) {
    shifts[input.key] = await prisma.shift.create({
      data: { name: input.name, startTime: input.startTime, endTime: input.endTime }
    });
  }

  return { lines, machines, products, shifts };
}

async function seedBomAndInventory({ products, admin }) {
  const bomDefinitions = [
    ["PRD-HVG-001", [
      ["CMP-ALU-6061", 2.4, "kg", 4],
      ["CMP-VALF-KIT", 1, "set", 1],
      ["CMP-ETIKET", 1, "adet", 0.5],
      ["CMP-KOLI", 0.2, "adet", 0]
    ]],
    ["PRD-AMB-120", [
      ["CMP-SAC-2MM", 1.6, "kg", 3],
      ["CMP-CIV-M6", 1, "set", 1],
      ["CMP-BOYA-GRI", 0.08, "kg", 2],
      ["CMP-ETIKET", 1, "adet", 0.5],
      ["CMP-KOLI", 1, "adet", 0]
    ]],
    ["PRD-BRK-045", [
      ["CMP-SAC-3MM", 0.85, "kg", 5],
      ["CMP-BOYA-GRI", 0.04, "kg", 2],
      ["CMP-ETIKET", 1, "adet", 0.5]
    ]],
    ["PRD-MTK-210", [
      ["CMP-SAC-2MM", 1.2, "kg", 4],
      ["CMP-CIV-M6", 1, "set", 1],
      ["CMP-ETIKET", 1, "adet", 0.5],
      ["CMP-KOLI", 1, "adet", 0]
    ]],
    ["PRD-KPN-330", [
      ["CMP-SAC-3MM", 2.1, "kg", 6],
      ["CMP-BOYA-GRI", 0.12, "kg", 2],
      ["CMP-CIV-M6", 2, "set", 1],
      ["CMP-ETIKET", 1, "adet", 0.5],
      ["CMP-KOLI", 1, "adet", 0]
    ]]
  ];

  for (const [productCode, items] of bomDefinitions) {
    await prisma.productBomItem.createMany({
      data: items.map(([componentCode, quantity, unit, wastePercent]) => ({
        productId: products[productCode].id,
        componentProductId: products[componentCode].id,
        quantity,
        unit,
        wastePercent,
        note: "Standart metal parça üretim reçetesi"
      }))
    });
  }

  const stockDefinitions = [
    ["CMP-SAC-2MM", 850, 250, "Hammadde Deposu / Sac Rafı A-01"],
    ["CMP-SAC-3MM", 640, 220, "Hammadde Deposu / Sac Rafı A-02"],
    ["CMP-ALU-6061", 420, 120, "Hammadde Deposu / Alüminyum Rafı B-01"],
    ["CMP-VALF-KIT", 260, 80, "Montaj Deposu / Kutu V-03"],
    ["CMP-CIV-M6", 920, 200, "Montaj Deposu / Bağlantı Elemanları"],
    ["CMP-BOYA-GRI", 180, 50, "Boya Deposu / Toz Boya Alanı"],
    ["CMP-ETIKET", 2400, 500, "Paketleme / Etiket Rafı"],
    ["CMP-KOLI", 760, 150, "Paketleme / Koli Alanı"],
    ["PRD-HVG-001", 36, 20, "Bitmiş Ürün Deposu"],
    ["PRD-AMB-120", 48, 25, "Bitmiş Ürün Deposu"],
    ["PRD-BRK-045", 140, 60, "Bitmiş Ürün Deposu"],
    ["PRD-MTK-210", 72, 30, "Bitmiş Ürün Deposu"],
    ["PRD-KPN-330", 24, 12, "Bitmiş Ürün Deposu"]
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
        referenceId: "METAL_PARTS_FACTORY_PROFILE",
        note: productCode.startsWith("CMP-") ? "Başlangıç hammadde stoğu" : "Başlangıç bitmiş ürün stoğu",
        createdById: admin.id
      }
    });
  }
}

async function seedRoutes({ products, machines }) {
  const definitions = [
    {
      product: products["PRD-HVG-001"],
      name: "Hidrolik Valf Gövdesi İşleme Rotası",
      operations: [
        ["CNC Tornalama", "CNC-01", 72, false],
        ["CNC Frezeleme", "CNC-02", 68, false],
        ["Delik Delme ve Diş Açma", "DRL-01", 32, false],
        ["Fonksiyon Test", "TST-01", 30, true],
        ["Final Kalite Kontrol", "KLT-02", 24, true],
        ["Paketleme ve Etiketleme", "PKT-01", 18, false]
      ]
    },
    {
      product: products["PRD-AMB-120"],
      name: "Ambalajlı Final Modül Rotası",
      operations: [
        ["Lazer Kesim", "LZR-01", 30, false],
        ["Presleme", "PRS-01", 28, false],
        ["Manuel Montaj", "MNT-01", 56, false],
        ["Fonksiyon Test", "TST-01", 34, true],
        ["Final Kalite Kontrol", "KLT-02", 20, true],
        ["Paketleme ve Etiketleme", "PKT-01", 22, false]
      ]
    },
    {
      product: products["PRD-BRK-045"],
      name: "Bağlantı Braketi Sac Şekillendirme Rotası",
      operations: [
        ["Lazer Kesim", "LZR-01", 28, false],
        ["Abkant Büküm", "BKM-01", 34, false],
        ["Delik Delme ve Çapak Alma", "DRL-01", 26, false],
        ["Toz Boya", "BOY-01", 70, false],
        ["Ölçü Kontrol", "KLT-01", 22, true],
        ["Paketleme ve Etiketleme", "PKT-01", 16, false]
      ]
    },
    {
      product: products["PRD-MTK-210"],
      name: "Motor Kapak Seti Rotası",
      operations: [
        ["Presleme", "PRS-01", 32, false],
        ["Delik Delme", "DRL-01", 30, false],
        ["CNC Frezeleme", "CNC-02", 42, false],
        ["Manuel Montaj", "MNT-02", 48, false],
        ["Final Kalite Kontrol", "KLT-02", 20, true],
        ["Paketleme ve Etiketleme", "PKT-01", 18, false]
      ]
    },
    {
      product: products["PRD-KPN-330"],
      name: "Kontrol Panel Kutusu Rotası",
      operations: [
        ["Lazer Kesim", "LZR-01", 35, false],
        ["Abkant Büküm", "BKM-01", 40, false],
        ["Robot Kaynak", "KYN-01", 44, false],
        ["Toz Boya", "BOY-01", 80, false],
        ["Manuel Montaj", "MNT-02", 58, false],
        ["Final Kalite Kontrol", "KLT-02", 25, true],
        ["Paketleme ve Etiketleme", "PKT-01", 28, false]
      ]
    }
  ];

  const routes = [];
  for (const definition of definitions) {
    const route = await prisma.productRoute.create({
      data: {
        productId: definition.product.id,
        name: definition.name,
        description: "Metal parça fabrikası için standart operasyon akışı"
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

async function seedGroupsSkillsAndRoster({ operators, machines, shifts }) {
  const machineCodesByGroup = {
    "Kesim Ekibi": ["PRS-01", "LZR-01", "BKM-01"],
    "CNC Ekibi": ["CNC-01", "CNC-02", "DRL-01"],
    "Kaynak Ekibi": ["KYN-01", "MNT-01"],
    "Montaj Ekibi": ["MNT-01", "MNT-02", "PKT-01", "BOY-01"],
    "Kalite Ekibi": ["TST-01", "KLT-01", "KLT-02"]
  };

  const groups = {};
  for (let groupIndex = 0; groupIndex < tr.groups.length; groupIndex += 1) {
    const groupName = tr.groups[groupIndex];
    const group = await prisma.operatorGroup.create({
      data: {
        name: groupName,
        description: `${groupName} için aylık vardiya ve makine yetkinliği grubu`
      }
    });
    groups[groupName] = group;

    const members = operators.slice(groupIndex * 10, groupIndex * 10 + 10);
    await prisma.operatorGroupMember.createMany({
      data: members.map((operator) => ({ groupId: group.id, operatorId: operator.id }))
    });

    const skillRows = [];
    members.forEach((operator, operatorIndex) => {
      machineCodesByGroup[groupName].forEach((machineCode, machineIndex) => {
        skillRows.push({
          operatorId: operator.id,
          machineId: machines[machineCode].id,
          level: operatorIndex % 3 === 0 || machineIndex === 0 ? "CERTIFIED" : operatorIndex % 2 === 0 ? "ADVANCED" : "BASIC",
          note: `${groupName} standart yetkinliği`
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
        const teamMemberIndex = operatorIndex % 10;
        const shiftKey = shiftKeys[(teamMemberIndex + Math.floor((day - 1) / 7)) % shiftKeys.length];
        assignments.push({
          operatorId: operator.id,
          shiftId: shifts[shiftKey].id,
          workDate,
          startTime: shifts[shiftKey].startTime,
          endTime: shifts[shiftKey].endTime,
          status: isSunday ? "LEAVE" : "CONFIRMED",
          note: isSunday ? "Haftalık izin" : `${monthOffset === 0 ? "Bu ay" : "Gelecek ay"} planlı vardiya`
        });
      });
    }
  }

  await prisma.shiftAssignment.createMany({ data: assignments });

  for (const [index, groupName] of tr.groups.entries()) {
    await prisma.shiftTemplate.create({
      data: {
        name: `${groupName} 6 Günlük Döngü`,
        description: "Haftada 6 gün çalışan ekip için aylık plan şablonu",
        pattern: "SIX_DAYS",
        shiftId: shifts[shiftKeys[index % shiftKeys.length]].id,
        groupId: groups[groupName].id
      }
    });
  }

  return groups;
}

function pickOperatorForMachine(machineCode, operators) {
  const groupIndexByMachine = {
    PRS: 0,
    LZR: 0,
    BKM: 0,
    CNC: 1,
    DRL: 1,
    KYN: 2,
    MNT: 3,
    PKT: 3,
    TST: 4,
    KLT: 4,
    BOY: 3
  };
  const prefix = machineCode.split("-")[0];
  const groupIndex = groupIndexByMachine[prefix] ?? 0;
  const pool = operators.slice(groupIndex * 10, groupIndex * 10 + 10);
  return pool[Math.floor(Math.random() * pool.length)] ?? operators[0];
}

async function createWorkOrderScenario({ orderNo, routePack, operators, shifts, manager, qualityStaff, dayOffset, status, plannedQuantity, progressRatio = 1 }) {
  const plannedStartDate = addDays(dateOnly(new Date()), dayOffset);
  const actualStartDate = dayOffset <= 0 && status !== "PLANNED" ? addMinutes(plannedStartDate, 6 * 60 + 20) : null;
  const isCompleted = status === "COMPLETED";
  const isActive = ["IN_PROGRESS", "PAUSED"].includes(status);
  const expectedScrap = status === "PLANNED" ? 0 : Math.max(0, Math.round(plannedQuantity * (0.01 + ((Math.abs(dayOffset) % 5) * 0.004))));

  const workOrder = await prisma.workOrder.create({
    data: {
      orderNo,
      productId: routePack.product.id,
      routeId: routePack.route.id,
      plannedQuantity,
      producedQuantity: 0,
      scrapQuantity: 0,
      status,
      plannedStartDate,
      plannedEndDate: addDays(plannedStartDate, 1),
      actualStartDate,
      actualEndDate: isCompleted ? addMinutes(plannedStartDate, 22 * 60) : null,
      createdById: manager.id
    }
  });

  let operationScrapTotal = 0;
  const operations = [];
  for (let index = 0; index < routePack.operations.length; index += 1) {
    const routeOperation = routePack.operations[index];
    const machine = await prisma.machine.findUnique({ where: { id: routeOperation.defaultMachineId } });
    const operator = pickOperatorForMachine(machine.code, operators);
    let operationStatus = "WAITING";

    if (isCompleted) {
      operationStatus = "COMPLETED";
    } else if (isActive) {
      if (index < Math.floor(routePack.operations.length * progressRatio)) {
        operationStatus = "COMPLETED";
      } else if (index === Math.floor(routePack.operations.length * progressRatio)) {
        operationStatus = status === "PAUSED" ? "PAUSED" : "IN_PROGRESS";
      }
    } else if (index === 0) {
      operationStatus = "READY";
    }

    const operationScrap =
      operationStatus === "WAITING" || operationStatus === "READY" ? 0 : Math.min(expectedScrap, Math.max(0, Math.floor((index + Math.abs(dayOffset)) % 3)));
    operationScrapTotal += operationScrap;
    const operationGood =
      operationStatus === "COMPLETED"
        ? plannedQuantity
        : operationStatus === "IN_PROGRESS" || operationStatus === "PAUSED"
          ? Math.max(1, Math.round(plannedQuantity * Math.min(progressRatio, 0.75)))
          : 0;

    const startedAt = operationStatus !== "WAITING" && actualStartDate ? addMinutes(actualStartDate, index * 95) : null;
    const completedAt = operationStatus === "COMPLETED" && startedAt ? addMinutes(startedAt, routeOperation.estimatedMinutes ?? 45) : null;

    const operation = await prisma.workOrderOperation.create({
      data: {
        workOrderId: workOrder.id,
        routeOperationId: routeOperation.id,
        machineId: routeOperation.defaultMachineId,
        assignedOperatorId: operator.id,
        sequenceNo: routeOperation.sequenceNo,
        operationName: routeOperation.operationName,
        status: operationStatus,
        producedQuantity: operationStatus === "WAITING" ? 0 : operationGood,
        scrapQuantity: operationScrap,
        startedAt,
        completedAt
      }
    });
    operations.push({ operation, operator, machine, operationGood, operationScrap, startedAt, completedAt });

    if (["COMPLETED", "IN_PROGRESS", "PAUSED"].includes(operationStatus)) {
      await prisma.productionLog.create({
        data: {
          workOrderId: workOrder.id,
          workOrderOperationId: operation.id,
          operatorId: operator.id,
          machineId: routeOperation.defaultMachineId,
          shiftId: shifts[index % 3 === 0 ? "S" : index % 3 === 1 ? "A" : "G"].id,
          producedQuantity: operationGood,
          scrapQuantity: operationScrap,
          scrapReason: operationScrap > 0 ? ["MATERIAL_DEFECT", "MACHINE_SETUP", "PROCESS_DEVIATION", "OPERATOR_ERROR"][index % 4] : null,
          startedAt,
          endedAt: completedAt,
          createdAt: completedAt ?? startedAt ?? new Date(),
          note: operationStatus === "PAUSED" ? "Operasyon duraklatıldı, üretim tekrar başlatılabilir." : `${routeOperation.operationName} üretim kaydı`
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
          shiftId: shifts.A.id,
          reason: ["MACHINE_FAILURE", "MATERIAL_WAITING", "QUALITY_WAITING"][Math.abs(dayOffset) % 3],
          note: "Demo duruş kaydı: üretim planlama ekranında takip edilmeli.",
          startedAt: startedAt ? addMinutes(startedAt, 35) : new Date()
        }
      });
    }

    if (operationStatus !== "WAITING" && index % 3 === 1) {
      await prisma.operationMessage.create({
        data: {
          workOrderOperationId: operation.id,
          senderId: operator.id,
          severity: operationScrap > 0 ? "WARNING" : "INFO",
          message: operationScrap > 0 ? "Parçada yüzey izi görüldü, kalite adımında kontrol edilmeli." : "Operasyon planlandığı gibi ilerliyor."
        }
      });
    }
  }

  if (isCompleted) {
    const qualityOperation = operations.find((item) => item.operation.operationName.toLocaleLowerCase("tr-TR").includes("kontrol")) ?? operations.at(-1);
    const defectQuantity = Math.min(operationScrapTotal + (Math.abs(dayOffset) % 4), 7);
    await prisma.qualityCheck.create({
      data: {
        workOrderId: workOrder.id,
        workOrderOperationId: qualityOperation.operation.id,
        checkedById: qualityStaff.id,
        status: defectQuantity > 4 ? "PARTIAL" : "PASSED",
        defectQuantity,
        defectReason: defectQuantity > 0 ? "Yüzey çizigi / ölçü kontrol sapması" : null,
        note: defectQuantity > 0 ? "Numune kontrol sonrası ayrıştırma yapıldı." : "Final kalite kontrol uygun."
      }
    });

    if (defectQuantity > 4) {
      const log = await prisma.productionLog.findFirst({ where: { workOrderId: workOrder.id }, orderBy: { createdAt: "desc" } });
      const alert = await prisma.productionAlert.create({
        data: {
          productionLogId: log.id,
          workOrderId: workOrder.id,
          createdById: qualityStaff.id,
          assignedToId: manager.id,
          resolvedById: manager.id,
          title: `${orderNo} kalite aksiyonu`,
          message: "Final kontrolde kritik olmayan uygunsuzluk yakalandı.",
          severity: "WARNING",
          status: "RESOLVED",
          resolutionNote: "Kusurlu parçalar ayrıldı, kalan parti şartlı kabul edildi.",
          qualityDecision: "CONDITIONAL_ACCEPT",
          qualityDecisionNote: "Müşteri sevki için kusurlu adet ayrıştırıldı.",
          resolvedAt: new Date()
        }
      });
      await prisma.productionAlertEvent.create({
        data: {
          alertId: alert.id,
          actorId: manager.id,
          type: "RESOLVED",
          fromStatus: "OPEN",
          toStatus: "RESOLVED",
          note: "Şartlı kabul ile kapatıldı."
        }
      });
    }
  }

  if (isActive) {
    const current = operations.find((item) => ["IN_PROGRESS", "PAUSED"].includes(item.operation.status));
    if (current) {
      await prisma.notification.create({
        data: {
          recipientId: current.operator.id,
          type: "WORK_ORDER_ASSIGNED",
          title: status === "PAUSED" ? "Duraklatılmış iş emri" : "Aktif operasyon atandı",
          message: `${orderNo} / ${current.operation.operationName} sizin üzerinizde.`,
          entityType: "WORK_ORDER",
          entityId: workOrder.id,
          metadata: { workOrderId: workOrder.id, operationId: current.operation.id }
        }
      });
    }
  }

  await prisma.workOrder.update({
    where: { id: workOrder.id },
    data: {
      producedQuantity: operations.at(-1)?.operation.producedQuantity ?? 0,
      scrapQuantity: operationScrapTotal
    }
  });

  return workOrder;
}

async function seedWorkOrders({ routes, operators, shifts, manager, qualityStaff }) {
  const scenarios = [];
  for (let index = 0; index < 24; index += 1) {
    scenarios.push({
      orderNo: `FAC-2026-06-${String(index + 1).padStart(3, "0")}`,
      routePack: routes[index % routes.length],
      dayOffset: -20 + index,
      status: index < 18 ? "COMPLETED" : index % 2 === 0 ? "IN_PROGRESS" : "PAUSED",
      plannedQuantity: 80 + (index % 6) * 20,
      progressRatio: index < 18 ? 0.96 + (index % 3) * 0.01 : 0.35 + (index % 4) * 0.12
    });
  }

  for (let index = 0; index < 10; index += 1) {
    scenarios.push({
      orderNo: `FAC-2026-07-${String(index + 1).padStart(3, "0")}`,
      routePack: routes[(index + 2) % routes.length],
      dayOffset: 8 + index * 2,
      status: "PLANNED",
      plannedQuantity: 100 + (index % 5) * 30,
      progressRatio: 0
    });
  }

  scenarios.push(
    {
      orderNo: "FAC-2026-06-PLAN-TODAY",
      routePack: routes[0],
      dayOffset: 0,
      status: "PLANNED",
      plannedQuantity: 150,
      progressRatio: 0
    },
    {
      orderNo: "FAC-2026-06-PLAN-TOMORROW",
      routePack: routes[1],
      dayOffset: 1,
      status: "PLANNED",
      plannedQuantity: 120,
      progressRatio: 0
    }
  );

  for (const scenario of scenarios) {
    await createWorkOrderScenario({ ...scenario, operators, shifts, manager, qualityStaff });
  }
}

async function main() {
  await cleanupOperationalData();
  const { admin, manager, qualityStaff, operators } = await seedUsers();
  const masterData = await seedFactoryMasterData();
  const routes = await seedRoutes(masterData);
  await seedBomAndInventory({ products: masterData.products, admin });
  await seedGroupsSkillsAndRoster({ operators, machines: masterData.machines, shifts: masterData.shifts });
  await seedWorkOrders({ routes, operators, shifts: masterData.shifts, manager, qualityStaff });

  console.log({
    status: "ok",
    message: "Gerçekçi fabrika demo verisi yüklendi.",
    users: {
      admin: admin.email,
      manager: manager.email,
      quality: qualityStaff.email,
      operatorExample: operators[0].email,
      password
    },
    counts: {
      activeOperators: operators.length,
      formerOperators: formerOperatorNames.length,
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
