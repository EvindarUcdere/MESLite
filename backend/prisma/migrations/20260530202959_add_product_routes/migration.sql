-- CreateTable
CREATE TABLE "routes" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_operations" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "operationName" TEXT NOT NULL,
    "sequenceNo" INTEGER NOT NULL,
    "defaultMachineId" TEXT,
    "estimatedMinutes" INTEGER,
    "requiresQualityCheck" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "route_operations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "routes_productId_name_key" ON "routes"("productId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "route_operations_routeId_sequenceNo_key" ON "route_operations"("routeId", "sequenceNo");

-- AddForeignKey
ALTER TABLE "routes" ADD CONSTRAINT "routes_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_operations" ADD CONSTRAINT "route_operations_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_operations" ADD CONSTRAINT "route_operations_defaultMachineId_fkey" FOREIGN KEY ("defaultMachineId") REFERENCES "Machine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
