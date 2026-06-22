import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { allowRoles } from "../../middlewares/role.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as shiftPlanningController from "./shiftPlanning.controller.js";
import {
  generateMonthlyPlanSchema,
  updateGroupSchema,
  updateTemplateSchema,
  upsertGroupSchema,
  upsertTemplateSchema
} from "./shiftPlanning.validation.js";

export const shiftPlanningRoutes = Router();

shiftPlanningRoutes.use(requireAuth);

shiftPlanningRoutes.get("/groups", asyncHandler(shiftPlanningController.listGroups));
shiftPlanningRoutes.post("/groups", allowRoles("PLANNER", "PRODUCTION_MANAGER"), validate(upsertGroupSchema), asyncHandler(shiftPlanningController.createGroup));
shiftPlanningRoutes.put("/groups/:id", allowRoles("PLANNER", "PRODUCTION_MANAGER"), validate(updateGroupSchema), asyncHandler(shiftPlanningController.updateGroup));
shiftPlanningRoutes.delete("/groups/:id", allowRoles("PLANNER", "PRODUCTION_MANAGER"), asyncHandler(shiftPlanningController.removeGroup));

shiftPlanningRoutes.get("/templates", asyncHandler(shiftPlanningController.listTemplates));
shiftPlanningRoutes.post("/templates", allowRoles("PLANNER", "PRODUCTION_MANAGER"), validate(upsertTemplateSchema), asyncHandler(shiftPlanningController.createTemplate));
shiftPlanningRoutes.put("/templates/:id", allowRoles("PLANNER", "PRODUCTION_MANAGER"), validate(updateTemplateSchema), asyncHandler(shiftPlanningController.updateTemplate));
shiftPlanningRoutes.delete("/templates/:id", allowRoles("PLANNER", "PRODUCTION_MANAGER"), asyncHandler(shiftPlanningController.removeTemplate));

shiftPlanningRoutes.post("/generate-monthly", allowRoles("PLANNER", "PRODUCTION_MANAGER"), validate(generateMonthlyPlanSchema), asyncHandler(shiftPlanningController.generateMonthlyPlan));
