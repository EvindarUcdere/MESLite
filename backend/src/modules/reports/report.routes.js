import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { allowRoles } from "../../middlewares/role.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as reportController from "./report.controller.js";

export const reportRoutes = Router();

reportRoutes.use(requireAuth);
reportRoutes.get("/overview", allowRoles("ADMIN", "PLANNER", "PRODUCTION_MANAGER", "QUALITY_STAFF", "VIEWER"), asyncHandler(reportController.overview));
