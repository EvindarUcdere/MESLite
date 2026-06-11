CREATE TABLE IF NOT EXISTS "mobile_debug_logs" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "step" TEXT NOT NULL,
  "platform" TEXT,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "mobile_debug_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "mobile_debug_logs_userId_createdAt_idx" ON "mobile_debug_logs"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "mobile_debug_logs_category_step_createdAt_idx" ON "mobile_debug_logs"("category", "step", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mobile_debug_logs_userId_fkey'
  ) THEN
    ALTER TABLE "mobile_debug_logs"
      ADD CONSTRAINT "mobile_debug_logs_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
