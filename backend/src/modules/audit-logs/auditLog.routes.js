import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { allowRoles } from "../../middlewares/role.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as auditLogController from "./auditLog.controller.js";

export const auditLogRoutes = Router();

auditLogRoutes.use(requireAuth);
auditLogRoutes.get("/", allowRoles("ADMIN", "PRODUCTION_MANAGER", "VIEWER"), asyncHandler(auditLogController.list));
