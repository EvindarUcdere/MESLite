import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { allowRoles } from "../../middlewares/role.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as productionLineController from "./productionLine.controller.js";
import { createProductionLineSchema, updateProductionLineSchema } from "./productionLine.validation.js";

export const productionLineRoutes = Router();

productionLineRoutes.use(requireAuth);
productionLineRoutes.get("/", asyncHandler(productionLineController.list));
productionLineRoutes.get("/:id", asyncHandler(productionLineController.detail));
productionLineRoutes.post("/", allowRoles("ADMIN", "PRODUCTION_MANAGER"), validate(createProductionLineSchema), asyncHandler(productionLineController.create));
productionLineRoutes.put("/:id", allowRoles("ADMIN", "PRODUCTION_MANAGER"), validate(updateProductionLineSchema), asyncHandler(productionLineController.update));
