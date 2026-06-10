-- CreateEnum
CREATE TYPE "ShiftAssignmentStatus" AS ENUM ('PLANNED', 'CONFIRMED', 'ABSENT', 'LEAVE');

-- Align the development database state from the first local run of this migration.
DROP INDEX IF EXISTS "ProductionAlert_reworkOperationId_idx";

-- CreateEnum
CREATE TYPE "MachineSkillLevel" AS ENUM ('BASIC', 'ADVANCED', 'CERTIFIED');

-- CreateTable
CREATE TABLE "shift_assignments" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "status" "ShiftAssignmentStatus" NOT NULL DEFAULT 'PLANNED',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operator_machine_skills" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "level" "MachineSkillLevel" NOT NULL DEFAULT 'BASIC',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operator_machine_skills_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shift_assignments_shiftId_workDate_idx" ON "shift_assignments"("shiftId", "workDate");

-- CreateIndex
CREATE INDEX "shift_assignments_workDate_idx" ON "shift_assignments"("workDate");

-- CreateIndex
CREATE UNIQUE INDEX "shift_assignments_operatorId_workDate_key" ON "shift_assignments"("operatorId", "workDate");

-- CreateIndex
CREATE INDEX "operator_machine_skills_machineId_isActive_idx" ON "operator_machine_skills"("machineId", "isActive");

-- CreateIndex
CREATE INDEX "operator_machine_skills_operatorId_isActive_idx" ON "operator_machine_skills"("operatorId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "operator_machine_skills_operatorId_machineId_key" ON "operator_machine_skills"("operatorId", "machineId");

-- AddForeignKey
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operator_machine_skills" ADD CONSTRAINT "operator_machine_skills_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operator_machine_skills" ADD CONSTRAINT "operator_machine_skills_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
