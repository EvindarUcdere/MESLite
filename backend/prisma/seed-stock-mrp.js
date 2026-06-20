import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const products = [
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

async function getSeedActorId() {
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" }
  });

  if (!admin) {
    throw new Error("Stok hareketi yazmak için ADMIN kullanıcısı bulunamadı. Önce ana seed'i çalıştırın.");
  }

  return admin.id;
}

async function upsertProducts() {
  const productMap = {};

  for (const [code, name, unit, targetCycleTime] of products) {
    const product = await prisma.product.upsert({
      where: { code },
      update: {
        name,
        unit,
        targetCycleTime,
        isActive: true
      },
      create: {
        code,
        name,
        unit,
        targetCycleTime,
        isActive: true
      }
    });

    productMap[code] = product;
  }

  return productMap;
}

async function upsertBom(productMap) {
  let count = 0;

  for (const [productCode, items] of bomDefinitions) {
    for (const [componentCode, quantity, unit, wastePercent] of items) {
      await prisma.productBomItem.upsert({
        where: {
          productId_componentProductId: {
            productId: productMap[productCode].id,
            componentProductId: productMap[componentCode].id
          }
        },
        update: {
          quantity,
          unit,
          wastePercent,
          note: "Standart metal parça üretim reçetesi"
        },
        create: {
          productId: productMap[productCode].id,
          componentProductId: productMap[componentCode].id,
          quantity,
          unit,
          wastePercent,
          note: "Standart metal parça üretim reçetesi"
        }
      });
      count += 1;
    }
  }

  return count;
}

async function upsertStock(productMap, createdById) {
  let movementCount = 0;

  for (const [productCode, targetQuantity, minimumQuantity, location] of stockDefinitions) {
    const product = productMap[productCode];
    const existing = await prisma.stockItem.findUnique({
      where: { productId: product.id }
    });

    const currentQuantity = Number(existing?.quantityOnHand ?? 0);
    const difference = Number(targetQuantity) - currentQuantity;

    const stockItem = await prisma.stockItem.upsert({
      where: { productId: product.id },
      update: {
        quantityOnHand: targetQuantity,
        minimumQuantity,
        location
      },
      create: {
        productId: product.id,
        quantityOnHand: targetQuantity,
        minimumQuantity,
        location
      }
    });

    if (difference !== 0) {
      await prisma.stockMovement.create({
        data: {
          stockItemId: stockItem.id,
          productId: product.id,
          type: difference > 0 ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
          quantity: Math.abs(difference),
          balanceAfter: targetQuantity,
          referenceType: "STOCK_MRP_SEED",
          referenceId: "METAL_PARTS_INVENTORY_PROFILE",
          note: `${productCode} demo stok seviyesi ${targetQuantity} ${product.unit} olarak ayarlandı`,
          createdById
        }
      });
      movementCount += 1;
    }
  }

  return movementCount;
}

async function main() {
  const createdById = await getSeedActorId();
  const productMap = await upsertProducts();
  const bomCount = await upsertBom(productMap);
  const movementCount = await upsertStock(productMap, createdById);

  console.log({
    products: products.length,
    bomItems: bomCount,
    stockItems: stockDefinitions.length,
    stockMovementsCreated: movementCount
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
