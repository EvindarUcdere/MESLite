ALTER TABLE "WorkOrder"
ADD COLUMN "isTestData" BOOLEAN NOT NULL DEFAULT false;

UPDATE "WorkOrder"
SET "isTestData" = true
WHERE "orderNo" LIKE 'E2E-%';

CREATE INDEX "WorkOrder_isTestData_status_idx"
ON "WorkOrder"("isTestData", "status");
