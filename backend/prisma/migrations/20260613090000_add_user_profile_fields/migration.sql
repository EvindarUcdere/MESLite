ALTER TABLE "User" ADD COLUMN "employeeCode" TEXT;
ALTER TABLE "User" ADD COLUMN "phone" TEXT;
ALTER TABLE "User" ADD COLUMN "department" TEXT;
ALTER TABLE "User" ADD COLUMN "position" TEXT;
ALTER TABLE "User" ADD COLUMN "hireDate" DATE;
ALTER TABLE "User" ADD COLUMN "terminationDate" DATE;
ALTER TABLE "User" ADD COLUMN "emergencyContactName" TEXT;
ALTER TABLE "User" ADD COLUMN "emergencyContactPhone" TEXT;

CREATE UNIQUE INDEX "User_employeeCode_key" ON "User"("employeeCode");
