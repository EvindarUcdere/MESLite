CREATE TABLE "product_bom_items" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "componentProductId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "wastePercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_bom_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_bom_items_productId_componentProductId_key" ON "product_bom_items"("productId", "componentProductId");
CREATE INDEX "product_bom_items_componentProductId_idx" ON "product_bom_items"("componentProductId");

ALTER TABLE "product_bom_items" ADD CONSTRAINT "product_bom_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_bom_items" ADD CONSTRAINT "product_bom_items_componentProductId_fkey" FOREIGN KEY ("componentProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
