import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { allowRoles } from "../../middlewares/role.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as shiftAssignmentController from "./shiftAssignment.controller.js";
import { bulkUpsertShiftAssignmentsSchema, listShiftAssignmentsSchema, updateShiftAssignmentSchema, upsertShiftAssignmentSchema } from "./shiftAssignment.validation.js";

export const shiftAssignmentRoutes = Router();

shiftAssignmentRoutes.use(requireAuth);
shiftAssignmentRoutes.get("/", validate(listShiftAssignmentsSchema), asyncHandler(shiftAssignmentController.list));
shiftAssignmentRoutes.post("/bulk", allowRoles("PLANNER", "PRODUCTION_MANAGER"), validate(bulkUpsertShiftAssignmentsSchema), asyncHandler(shiftAssignmentController.bulkUpsert));
shiftAssignmentRoutes.post("/", allowRoles("PLANNER", "PRODUCTION_MANAGER"), validate(upsertShiftAssignmentSchema), asyncHandler(shiftAssignmentController.upsert));
shiftAssignmentRoutes.put("/:id", allowRoles("PLANNER", "PRODUCTION_MANAGER"), validate(updateShiftAssignmentSchema), asyncHandler(shiftAssignmentController.update));
shiftAssignmentRoutes.delete("/:id", allowRoles("PLANNER", "PRODUCTION_MANAGER"), asyncHandler(shiftAssignmentController.remove));
