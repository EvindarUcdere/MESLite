CREATE TYPE "ScrapLotStatus" AS ENUM ('QUARANTINED', 'REWORK_PLANNED', 'REPRODUCTION_PLANNED', 'SCRAPPED', 'CONDITIONALLY_ACCEPTED');

CREATE TABLE "scrap_lots" (
  "id" TEXT NOT NULL,
  "productionLogId" TEXT NOT NULL,
  "workOrderId" TEXT NOT NULL,
  "workOrderOperationId" TEXT,
  "productId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "reason" "ScrapReason",
  "disposition" "ScrapDisposition" NOT NULL DEFAULT 'PENDING_REVIEW',
  "status" "ScrapLotStatus" NOT NULL DEFAULT 'QUARANTINED',
  "location" TEXT NOT NULL DEFAULT 'KARANTINA',
  "actionWorkOrderId" TEXT,
  "resolvedById" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "scrap_lots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "scrap_lots_productionLogId_key" ON "scrap_lots"("productionLogId");
CREATE INDEX "scrap_lots_status_createdAt_idx" ON "scrap_lots"("status", "createdAt");
CREATE INDEX "scrap_lots_workOrderId_idx" ON "scrap_lots"("workOrderId");
CREATE INDEX "scrap_lots_productId_idx" ON "scrap_lots"("productId");

ALTER TABLE "scrap_lots" ADD CONSTRAINT "scrap_lots_productionLogId_fkey" FOREIGN KEY ("productionLogId") REFERENCES "ProductionLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scrap_lots" ADD CONSTRAINT "scrap_lots_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scrap_lots" ADD CONSTRAINT "scrap_lots_workOrderOperationId_fkey" FOREIGN KEY ("workOrderOperationId") REFERENCES "work_order_operations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "scrap_lots" ADD CONSTRAINT "scrap_lots_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "scrap_lots" ADD CONSTRAINT "scrap_lots_actionWorkOrderId_fkey" FOREIGN KEY ("actionWorkOrderId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "scrap_lots" ADD CONSTRAINT "scrap_lots_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "scrap_lots" (
  "id", "productionLogId", "workOrderId", "workOrderOperationId", "productId", "quantity", "reason",
  "disposition", "status", "location", "actionWorkOrderId", "resolvedAt", "note", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text, pl."id", pl."workOrderId", pl."workOrderOperationId", wo."productId", pl."scrapQuantity", pl."scrapReason",
  COALESCE(pl."scrapDisposition", 'PENDING_REVIEW'::"ScrapDisposition"),
  CASE
    WHEN pl."scrapDisposition" = 'REWORK' THEN 'REWORK_PLANNED'::"ScrapLotStatus"
    WHEN pl."scrapDisposition" = 'REPRODUCE' AND pl."scrapActionStatus" = 'CREATED' THEN 'REPRODUCTION_PLANNED'::"ScrapLotStatus"
    WHEN pl."scrapDisposition" = 'SCRAP' THEN 'SCRAPPED'::"ScrapLotStatus"
    WHEN pl."scrapDisposition" = 'CONDITIONAL_ACCEPT' THEN 'CONDITIONALLY_ACCEPTED'::"ScrapLotStatus"
    ELSE 'QUARANTINED'::"ScrapLotStatus"
  END,
  CASE WHEN pl."scrapDisposition" = 'SCRAP' THEN 'HURDA' ELSE 'KARANTINA' END,
  pl."scrapActionWorkOrderId",
  CASE WHEN pl."scrapDisposition" IS NOT NULL AND pl."scrapDisposition" <> 'PENDING_REVIEW' THEN CURRENT_TIMESTAMP ELSE NULL END,
  pl."scrapActionNote", pl."createdAt", CURRENT_TIMESTAMP
FROM "ProductionLog" pl
JOIN "WorkOrder" wo ON wo."id" = pl."workOrderId"
WHERE pl."scrapQuantity" > 0
ON CONFLICT ("productionLogId") DO NOTHING;
