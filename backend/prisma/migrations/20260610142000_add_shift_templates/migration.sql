-- CreateEnum
CREATE TYPE "ShiftTemplatePattern" AS ENUM ('WEEKDAYS', 'EVERY_DAY', 'FOUR_ON_TWO_OFF');

-- CreateTable
CREATE TABLE "operator_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operator_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operator_group_members" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operator_group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "pattern" "ShiftTemplatePattern" NOT NULL DEFAULT 'WEEKDAYS',
    "shiftId" TEXT NOT NULL,
    "groupId" TEXT,
    "startOffset" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "operator_groups_name_key" ON "operator_groups"("name");

-- CreateIndex
CREATE INDEX "operator_group_members_operatorId_idx" ON "operator_group_members"("operatorId");

-- CreateIndex
CREATE UNIQUE INDEX "operator_group_members_groupId_operatorId_key" ON "operator_group_members"("groupId", "operatorId");

-- CreateIndex
CREATE UNIQUE INDEX "shift_templates_name_key" ON "shift_templates"("name");

-- CreateIndex
CREATE INDEX "shift_templates_shiftId_idx" ON "shift_templates"("shiftId");

-- CreateIndex
CREATE INDEX "shift_templates_groupId_idx" ON "shift_templates"("groupId");

-- AddForeignKey
ALTER TABLE "operator_group_members" ADD CONSTRAINT "operator_group_members_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "operator_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operator_group_members" ADD CONSTRAINT "operator_group_members_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "operator_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
