import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { allowRoles } from "../../middlewares/role.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as inventoryController from "./inventory.controller.js";
import { createStockMovementSchema, materialCheckSchema, updateStockItemSchema } from "./inventory.validation.js";

export const inventoryRoutes = Router();

inventoryRoutes.use(requireAuth);
inventoryRoutes.get("/stock-items", asyncHandler(inventoryController.listStockItems));
inventoryRoutes.get("/movements", asyncHandler(inventoryController.listStockMovements));
inventoryRoutes.get("/material-check", validate(materialCheckSchema), asyncHandler(inventoryController.materialCheck));
inventoryRoutes.patch(
  "/stock-items/:productId",
  allowRoles("ADMIN", "PRODUCTION_MANAGER"),
  validate(updateStockItemSchema),
  asyncHandler(inventoryController.updateStockItem)
);
inventoryRoutes.post(
  "/movements",
  allowRoles("ADMIN", "PRODUCTION_MANAGER"),
  validate(createStockMovementSchema),
  asyncHandler(inventoryController.createMovement)
);
