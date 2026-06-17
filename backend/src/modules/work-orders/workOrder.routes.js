import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { allowRoles } from "../../middlewares/role.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as workOrderController from "./workOrder.controller.js";
import { assignMachineSchema, assignOperatorSchema, availableOperatorsSchema, createWorkOrderSchema, groupedScrapActionSchema, updateStatusSchema } from "./workOrder.validation.js";

export const workOrderRoutes = Router();

workOrderRoutes.use(requireAuth);
workOrderRoutes.get("/", asyncHandler(workOrderController.list));
workOrderRoutes.get("/available-operators", validate(availableOperatorsSchema), asyncHandler(workOrderController.availableOperators));
workOrderRoutes.get("/:id", asyncHandler(workOrderController.detail));
workOrderRoutes.post("/", allowRoles("ADMIN", "PRODUCTION_MANAGER"), validate(createWorkOrderSchema), asyncHandler(workOrderController.create));
workOrderRoutes.patch("/:id/status", allowRoles("ADMIN", "PRODUCTION_MANAGER"), validate(updateStatusSchema), asyncHandler(workOrderController.updateStatus));
workOrderRoutes.patch("/:id/assign-operator", allowRoles("ADMIN", "PRODUCTION_MANAGER"), validate(assignOperatorSchema), asyncHandler(workOrderController.assignOperator));
workOrderRoutes.patch("/:id/assign-machine", allowRoles("ADMIN", "PRODUCTION_MANAGER"), validate(assignMachineSchema), asyncHandler(workOrderController.assignMachine));
workOrderRoutes.post("/:id/start", allowRoles("ADMIN", "PRODUCTION_MANAGER", "OPERATOR"), asyncHandler(workOrderController.start));
workOrderRoutes.post("/:id/pause", allowRoles("ADMIN", "PRODUCTION_MANAGER", "OPERATOR"), asyncHandler(workOrderController.pause));
workOrderRoutes.post("/:id/complete", allowRoles("ADMIN", "PRODUCTION_MANAGER", "OPERATOR"), asyncHandler(workOrderController.complete));
workOrderRoutes.post(
  "/:id/grouped-scrap-action",
  allowRoles("ADMIN", "PRODUCTION_MANAGER", "QUALITY_STAFF"),
  validate(groupedScrapActionSchema),
  asyncHandler(workOrderController.createGroupedScrapAction)
);
