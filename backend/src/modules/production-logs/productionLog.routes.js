import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { allowRoles } from "../../middlewares/role.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as productionLogController from "./productionLog.controller.js";
import { createProductionLogSchema, updateProductionLogSchema } from "./productionLog.validation.js";

export const productionLogRoutes = Router();

productionLogRoutes.use(requireAuth);
productionLogRoutes.get("/", allowRoles("ADMIN", "PRODUCTION_MANAGER", "QUALITY_STAFF", "VIEWER"), asyncHandler(productionLogController.list));
productionLogRoutes.get("/:id", allowRoles("ADMIN", "PRODUCTION_MANAGER", "QUALITY_STAFF", "VIEWER"), asyncHandler(productionLogController.detail));
productionLogRoutes.post("/", allowRoles("ADMIN", "OPERATOR"), validate(createProductionLogSchema), asyncHandler(productionLogController.create));
productionLogRoutes.put("/:id", allowRoles("ADMIN", "PRODUCTION_MANAGER"), validate(updateProductionLogSchema), asyncHandler(productionLogController.update));
