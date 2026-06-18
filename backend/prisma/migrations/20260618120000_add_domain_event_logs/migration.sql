CREATE TABLE "domain_event_logs" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "summary" TEXT,
    "payload" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "domain_event_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "domain_event_logs_eventId_key" ON "domain_event_logs"("eventId");
CREATE INDEX "domain_event_logs_type_idx" ON "domain_event_logs"("type");
CREATE INDEX "domain_event_logs_occurredAt_idx" ON "domain_event_logs"("occurredAt");
CREATE INDEX "domain_event_logs_entityType_entityId_idx" ON "domain_event_logs"("entityType", "entityId");
