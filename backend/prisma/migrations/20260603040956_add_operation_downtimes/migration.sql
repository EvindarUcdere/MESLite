-- CreateEnum
CREATE TYPE "DowntimeReason" AS ENUM ('MACHINE_FAILURE', 'MATERIAL_WAITING', 'QUALITY_WAITING', 'MAINTENANCE', 'SETUP', 'OPERATOR_BREAK', 'OTHER');

-- CreateTable
CREATE TABLE "operation_downtimes" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "workOrderOperationId" TEXT NOT NULL,
    "machineId" TEXT,
    "operatorId" TEXT,
    "shiftId" TEXT,
    "reason" "DowntimeReason" NOT NULL,
    "note" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operation_downtimes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "operation_downtimes_workOrderOperationId_startedAt_idx" ON "operation_downtimes"("workOrderOperationId", "startedAt");

-- CreateIndex
CREATE INDEX "operation_downtimes_machineId_startedAt_idx" ON "operation_downtimes"("machineId", "startedAt");

-- CreateIndex
CREATE INDEX "operation_downtimes_shiftId_startedAt_idx" ON "operation_downtimes"("shiftId", "startedAt");

-- AddForeignKey
ALTER TABLE "operation_downtimes" ADD CONSTRAINT "operation_downtimes_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation_downtimes" ADD CONSTRAINT "operation_downtimes_workOrderOperationId_fkey" FOREIGN KEY ("workOrderOperationId") REFERENCES "work_order_operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation_downtimes" ADD CONSTRAINT "operation_downtimes_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation_downtimes" ADD CONSTRAINT "operation_downtimes_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation_downtimes" ADD CONSTRAINT "operation_downtimes_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;
