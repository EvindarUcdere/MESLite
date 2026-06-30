import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { allowRoles } from "../../middlewares/role.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as offlineOperationController from "./offlineOperation.controller.js";

export const offlineOperationRoutes = Router();

offlineOperationRoutes.use(requireAuth);
offlineOperationRoutes.get("/", allowRoles("ADMIN", "PRODUCTION_MANAGER", "VIEWER"), asyncHandler(offlineOperationController.list));
