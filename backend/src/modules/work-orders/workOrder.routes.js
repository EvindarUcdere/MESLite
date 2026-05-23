import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { allowRoles } from "../../middlewares/role.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as workOrderController from "./workOrder.controller.js";
import { createWorkOrderSchema, updateStatusSchema } from "./workOrder.validation.js";

export const workOrderRoutes = Router();

workOrderRoutes.use(requireAuth);
workOrderRoutes.get("/", asyncHandler(workOrderController.list));
workOrderRoutes.get("/:id", asyncHandler(workOrderController.detail));
workOrderRoutes.post("/", allowRoles("ADMIN", "PRODUCTION_MANAGER"), validate(createWorkOrderSchema), asyncHandler(workOrderController.create));
workOrderRoutes.patch("/:id/status", allowRoles("ADMIN", "PRODUCTION_MANAGER", "OPERATOR"), validate(updateStatusSchema), asyncHandler(workOrderController.updateStatus));
