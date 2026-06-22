import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { allowRoles } from "../../middlewares/role.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as qualityCheckController from "./qualityCheck.controller.js";
import { createQualityCheckSchema, updateQualityCheckSchema } from "./qualityCheck.validation.js";

export const qualityCheckRoutes = Router();

qualityCheckRoutes.use(requireAuth);
qualityCheckRoutes.get("/", allowRoles("ADMIN", "PLANNER", "PRODUCTION_MANAGER", "QUALITY_STAFF", "VIEWER"), asyncHandler(qualityCheckController.list));
qualityCheckRoutes.get("/:id", allowRoles("ADMIN", "PLANNER", "PRODUCTION_MANAGER", "QUALITY_STAFF", "VIEWER"), asyncHandler(qualityCheckController.detail));
qualityCheckRoutes.post("/", allowRoles("QUALITY_STAFF"), validate(createQualityCheckSchema), asyncHandler(qualityCheckController.create));
qualityCheckRoutes.put("/:id", allowRoles("QUALITY_STAFF"), validate(updateQualityCheckSchema), asyncHandler(qualityCheckController.update));
