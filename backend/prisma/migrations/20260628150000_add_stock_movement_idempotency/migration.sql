CREATE UNIQUE INDEX "stock_movements_productId_type_referenceType_referenceId_key"
ON "stock_movements"("productId", "type", "referenceType", "referenceId");
