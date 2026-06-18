import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { allowRoles } from "../../middlewares/role.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as domainEventLogController from "./domainEventLog.controller.js";

export const domainEventLogRoutes = Router();

domainEventLogRoutes.use(requireAuth);
domainEventLogRoutes.get("/", allowRoles("ADMIN", "PRODUCTION_MANAGER", "VIEWER"), asyncHandler(domainEventLogController.list));
