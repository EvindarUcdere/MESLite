ALTER TABLE "QualityCheck" ADD COLUMN "workOrderOperationId" TEXT;

ALTER TABLE "QualityCheck" ADD CONSTRAINT "QualityCheck_workOrderOperationId_fkey" FOREIGN KEY ("workOrderOperationId") REFERENCES "work_order_operations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
