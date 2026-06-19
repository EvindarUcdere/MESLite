CREATE TYPE "SalesOrderStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'PLANNED', 'IN_PRODUCTION', 'COMPLETED', 'CANCELLED');

CREATE TABLE "sales_orders" (
  "id" TEXT NOT NULL,
  "orderNo" TEXT NOT NULL,
  "customerName" TEXT NOT NULL,
  "requestedDate" TIMESTAMP(3),
  "dueDate" TIMESTAMP(3),
  "status" "SalesOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "note" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "sales_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sales_order_items" (
  "id" TEXT NOT NULL,
  "salesOrderId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unit" TEXT NOT NULL DEFAULT 'adet',
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "sales_order_items_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WorkOrder"
  ADD COLUMN "salesOrderId" TEXT,
  ADD COLUMN "salesOrderItemId" TEXT;

CREATE UNIQUE INDEX "sales_orders_orderNo_key" ON "sales_orders"("orderNo");
CREATE INDEX "sales_orders_status_dueDate_idx" ON "sales_orders"("status", "dueDate");
CREATE INDEX "sales_order_items_salesOrderId_idx" ON "sales_order_items"("salesOrderId");
CREATE INDEX "sales_order_items_productId_idx" ON "sales_order_items"("productId");
CREATE INDEX "WorkOrder_salesOrderId_idx" ON "WorkOrder"("salesOrderId");
CREATE INDEX "WorkOrder_salesOrderItemId_idx" ON "WorkOrder"("salesOrderItemId");

ALTER TABLE "sales_orders"
  ADD CONSTRAINT "sales_orders_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sales_order_items"
  ADD CONSTRAINT "sales_order_items_salesOrderId_fkey"
  FOREIGN KEY ("salesOrderId") REFERENCES "sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sales_order_items"
  ADD CONSTRAINT "sales_order_items_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WorkOrder"
  ADD CONSTRAINT "WorkOrder_salesOrderId_fkey"
  FOREIGN KEY ("salesOrderId") REFERENCES "sales_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkOrder"
  ADD CONSTRAINT "WorkOrder_salesOrderItemId_fkey"
  FOREIGN KEY ("salesOrderItemId") REFERENCES "sales_order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
