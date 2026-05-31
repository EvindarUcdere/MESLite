-- CreateEnum
CREATE TYPE "OperationMessageSeverity" AS ENUM ('INFO', 'WARNING', 'QUALITY_ALERT', 'STOPPAGE');

-- CreateTable
CREATE TABLE "operation_messages" (
    "id" TEXT NOT NULL,
    "workOrderOperationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" "OperationMessageSeverity" NOT NULL DEFAULT 'INFO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operation_messages_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "operation_messages" ADD CONSTRAINT "operation_messages_workOrderOperationId_fkey" FOREIGN KEY ("workOrderOperationId") REFERENCES "work_order_operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation_messages" ADD CONSTRAINT "operation_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
