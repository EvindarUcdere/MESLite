-- CreateEnum
CREATE TYPE "ScrapReason" AS ENUM ('MATERIAL_DEFECT', 'MACHINE_SETUP', 'OPERATOR_ERROR', 'PROCESS_DEVIATION', 'QUALITY_REJECT', 'OTHER');

-- AlterTable
ALTER TABLE "ProductionLog" ADD COLUMN     "scrapReason" "ScrapReason";
