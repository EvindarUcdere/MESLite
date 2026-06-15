-- Track what will happen to scrapped quantities so production loss is not only a number.
CREATE TYPE "ScrapDisposition" AS ENUM ('PENDING_REVIEW', 'REWORK', 'SCRAP', 'REPRODUCE', 'CONDITIONAL_ACCEPT');

ALTER TABLE "ProductionLog"
ADD COLUMN "scrapDisposition" "ScrapDisposition",
ADD COLUMN "scrapResolutionQuantity" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "scrapDispositionNote" TEXT;
