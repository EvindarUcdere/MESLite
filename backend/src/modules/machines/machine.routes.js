import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { allowRoles } from "../../middlewares/role.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as machineController from "./machine.controller.js";
import { createMachineSchema, updateMachineSchema, updateMachineStatusSchema } from "./machine.validation.js";

export const machineRoutes = Router();

machineRoutes.use(requireAuth);
machineRoutes.get("/", asyncHandler(machineController.list));
machineRoutes.get("/:id", asyncHandler(machineController.detail));
machineRoutes.post("/", allowRoles("ADMIN", "PLANNER", "PRODUCTION_MANAGER"), validate(createMachineSchema), asyncHandler(machineController.create));
machineRoutes.put("/:id", allowRoles("ADMIN", "PLANNER", "PRODUCTION_MANAGER"), validate(updateMachineSchema), asyncHandler(machineController.update));
machineRoutes.patch("/:id/status", allowRoles("PRODUCTION_MANAGER", "OPERATOR"), validate(updateMachineStatusSchema), asyncHandler(machineController.updateStatus));
