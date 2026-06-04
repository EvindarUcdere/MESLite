import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { allowRoles } from "../../middlewares/role.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as productionAlertController from "./productionAlert.controller.js";
import { decideQualityActionSchema, listProductionAlertsSchema, updateProductionAlertSchema } from "./productionAlert.validation.js";

export const productionAlertRoutes = Router();

productionAlertRoutes.use(requireAuth);
productionAlertRoutes.get(
  "/",
  allowRoles("ADMIN", "PRODUCTION_MANAGER", "QUALITY_STAFF", "VIEWER"),
  validate(listProductionAlertsSchema),
  asyncHandler(productionAlertController.list)
);
productionAlertRoutes.patch(
  "/:id",
  allowRoles("ADMIN", "PRODUCTION_MANAGER", "QUALITY_STAFF"),
  validate(updateProductionAlertSchema),
  asyncHandler(productionAlertController.update)
);
productionAlertRoutes.post(
  "/:id/quality-action",
  allowRoles("ADMIN", "PRODUCTION_MANAGER"),
  validate(decideQualityActionSchema),
  asyncHandler(productionAlertController.decideQualityAction)
);
