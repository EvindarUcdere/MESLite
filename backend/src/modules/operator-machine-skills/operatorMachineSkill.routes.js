import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { allowRoles } from "../../middlewares/role.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as operatorMachineSkillController from "./operatorMachineSkill.controller.js";
import {
  listOperatorMachineSkillsSchema,
  updateOperatorMachineSkillSchema,
  upsertOperatorMachineSkillSchema
} from "./operatorMachineSkill.validation.js";

export const operatorMachineSkillRoutes = Router();

operatorMachineSkillRoutes.use(requireAuth);
operatorMachineSkillRoutes.get("/", validate(listOperatorMachineSkillsSchema), asyncHandler(operatorMachineSkillController.list));
operatorMachineSkillRoutes.post("/", allowRoles("ADMIN", "PRODUCTION_MANAGER"), validate(upsertOperatorMachineSkillSchema), asyncHandler(operatorMachineSkillController.upsert));
operatorMachineSkillRoutes.put("/:id", allowRoles("ADMIN", "PRODUCTION_MANAGER"), validate(updateOperatorMachineSkillSchema), asyncHandler(operatorMachineSkillController.update));
operatorMachineSkillRoutes.delete("/:id", allowRoles("ADMIN", "PRODUCTION_MANAGER"), asyncHandler(operatorMachineSkillController.remove));
