CREATE TYPE "StockMovementType" AS ENUM (
    'PURCHASE_IN',
    'PRODUCTION_IN',
    'CONSUMPTION_OUT',
    'SCRAP_OUT',
    'ADJUSTMENT_IN',
    'ADJUSTMENT_OUT'
);

CREATE TABLE "stock_items" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantityOnHand" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "reservedQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "minimumQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "location" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "stock_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "stockItemId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "balanceAfter" DECIMAL(14,3) NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stock_items_productId_key" ON "stock_items"("productId");
CREATE INDEX "stock_movements_productId_createdAt_idx" ON "stock_movements"("productId", "createdAt");
CREATE INDEX "stock_movements_type_idx" ON "stock_movements"("type");

ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "stock_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
