-- AlterTable
ALTER TABLE "ProductionLog" ADD COLUMN     "workOrderOperationId" TEXT;

-- AddForeignKey
ALTER TABLE "ProductionLog" ADD CONSTRAINT "ProductionLog_workOrderOperationId_fkey" FOREIGN KEY ("workOrderOperationId") REFERENCES "work_order_operations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
