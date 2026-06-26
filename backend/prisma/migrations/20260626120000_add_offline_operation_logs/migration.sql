-- Store client-generated offline operation IDs so retrying a queued mobile action is idempotent.
CREATE TABLE "offline_operation_logs" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workOrderId" TEXT,
    "payload" JSONB,
    "response" JSONB,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncedAt" TIMESTAMP(3),

    CONSTRAINT "offline_operation_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "offline_operation_logs_operationId_key" ON "offline_operation_logs"("operationId");
CREATE INDEX "offline_operation_logs_userId_createdAt_idx" ON "offline_operation_logs"("userId", "createdAt");
CREATE INDEX "offline_operation_logs_type_status_idx" ON "offline_operation_logs"("type", "status");
CREATE INDEX "offline_operation_logs_workOrderId_idx" ON "offline_operation_logs"("workOrderId");

ALTER TABLE "offline_operation_logs"
ADD CONSTRAINT "offline_operation_logs_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
