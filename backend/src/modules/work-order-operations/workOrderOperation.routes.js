import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { allowRoles } from "../../middlewares/role.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as workOrderOperationController from "./workOrderOperation.controller.js";
import { createOperationMessageSchema, pauseOperationSchema } from "./workOrderOperation.validation.js";

export const workOrderOperationRoutes = Router();

workOrderOperationRoutes.use(requireAuth);
workOrderOperationRoutes.get("/", allowRoles("ADMIN", "PRODUCTION_MANAGER", "QUALITY_STAFF", "VIEWER"), asyncHandler(workOrderOperationController.list));
workOrderOperationRoutes.get("/my", allowRoles("OPERATOR"), asyncHandler(workOrderOperationController.my));
workOrderOperationRoutes.post("/:id/start", allowRoles("ADMIN", "PRODUCTION_MANAGER", "OPERATOR"), asyncHandler(workOrderOperationController.start));
workOrderOperationRoutes.post("/:id/pause", allowRoles("ADMIN", "PRODUCTION_MANAGER", "OPERATOR"), validate(pauseOperationSchema), asyncHandler(workOrderOperationController.pause));
workOrderOperationRoutes.post("/:id/complete", allowRoles("ADMIN", "PRODUCTION_MANAGER", "OPERATOR"), asyncHandler(workOrderOperationController.complete));
workOrderOperationRoutes.post(
  "/:id/messages",
  allowRoles("ADMIN", "PRODUCTION_MANAGER", "QUALITY_STAFF", "OPERATOR"),
  validate(createOperationMessageSchema),
  asyncHandler(workOrderOperationController.createMessage)
);
