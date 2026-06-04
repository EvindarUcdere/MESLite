CREATE TYPE "QualityActionDecision" AS ENUM ('REWORK_OPERATION', 'SCRAP', 'CONDITIONAL_ACCEPT');

ALTER TABLE "ProductionAlert"
ADD COLUMN "qualityDecision" "QualityActionDecision",
ADD COLUMN "qualityDecisionNote" TEXT,
ADD COLUMN "reworkOperationId" TEXT;

ALTER TABLE "ProductionAlert"
ADD CONSTRAINT "ProductionAlert_reworkOperationId_fkey"
FOREIGN KEY ("reworkOperationId") REFERENCES "work_order_operations"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ProductionAlert_reworkOperationId_idx" ON "ProductionAlert"("reworkOperationId");
