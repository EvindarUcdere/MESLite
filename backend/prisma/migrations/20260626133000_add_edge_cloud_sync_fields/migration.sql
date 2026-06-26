ALTER TABLE "offline_operation_logs"
ADD COLUMN "cloudSyncStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
ADD COLUMN "cloudRetryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "cloudErrorMessage" TEXT,
ADD COLUMN "cloudSyncedAt" TIMESTAMP(3);

CREATE INDEX "offline_operation_logs_cloudSyncStatus_createdAt_idx" ON "offline_operation_logs"("cloudSyncStatus", "createdAt");
