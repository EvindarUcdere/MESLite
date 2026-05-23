import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { allowRoles } from "../../middlewares/role.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as machineController from "./machine.controller.js";
import { updateMachineStatusSchema } from "./machine.validation.js";

export const machineRoutes = Router();

machineRoutes.use(requireAuth);
machineRoutes.get("/", asyncHandler(machineController.list));
machineRoutes.patch("/:id/status", allowRoles("ADMIN", "PRODUCTION_MANAGER", "OPERATOR"), validate(updateMachineStatusSchema), asyncHandler(machineController.updateStatus));
