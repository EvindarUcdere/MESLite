import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { allowRoles } from "../../middlewares/role.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as shiftController from "./shift.controller.js";
import { createShiftSchema, updateShiftSchema } from "./shift.validation.js";

export const shiftRoutes = Router();

shiftRoutes.use(requireAuth);
shiftRoutes.get("/", asyncHandler(shiftController.list));
shiftRoutes.get("/:id", asyncHandler(shiftController.detail));
shiftRoutes.post("/", allowRoles("ADMIN", "PRODUCTION_MANAGER"), validate(createShiftSchema), asyncHandler(shiftController.create));
shiftRoutes.put("/:id", allowRoles("ADMIN", "PRODUCTION_MANAGER"), validate(updateShiftSchema), asyncHandler(shiftController.update));
