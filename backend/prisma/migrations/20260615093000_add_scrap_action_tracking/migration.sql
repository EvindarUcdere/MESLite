DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ScrapActionStatus') THEN
    CREATE TYPE "ScrapActionStatus" AS ENUM ('PENDING', 'CREATED', 'NOT_REQUIRED');
  END IF;
END $$;

ALTER TABLE "ProductionLog"
ADD COLUMN "scrapActionStatus" "ScrapActionStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "scrapActionWorkOrderId" TEXT,
ADD COLUMN "scrapActionWorkOrderNo" TEXT,
ADD COLUMN "scrapActionNote" TEXT;
