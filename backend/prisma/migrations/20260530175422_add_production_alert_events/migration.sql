-- CreateEnum
CREATE TYPE "AlertEventType" AS ENUM ('CREATED', 'STATUS_CHANGED', 'ASSIGNED', 'RESOLVED', 'COMMENT');

-- CreateTable
CREATE TABLE "ProductionAlertEvent" (
    "id" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "type" "AlertEventType" NOT NULL,
    "fromStatus" "AlertStatus",
    "toStatus" "AlertStatus",
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionAlertEvent_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ProductionAlertEvent" ADD CONSTRAINT "ProductionAlertEvent_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "ProductionAlert"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionAlertEvent" ADD CONSTRAINT "ProductionAlertEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
