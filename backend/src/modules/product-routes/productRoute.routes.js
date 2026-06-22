import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { allowRoles } from "../../middlewares/role.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as productRouteController from "./productRoute.controller.js";
import { createProductRouteSchema, updateProductRouteSchema } from "./productRoute.validation.js";

export const productRouteRoutes = Router();

productRouteRoutes.use(requireAuth);
productRouteRoutes.get("/", allowRoles("ADMIN", "PLANNER", "PRODUCTION_MANAGER", "QUALITY_STAFF", "VIEWER"), asyncHandler(productRouteController.list));
productRouteRoutes.get("/:id", allowRoles("ADMIN", "PLANNER", "PRODUCTION_MANAGER", "QUALITY_STAFF", "VIEWER"), asyncHandler(productRouteController.detail));
productRouteRoutes.post("/", allowRoles("ADMIN", "PLANNER", "PRODUCTION_MANAGER"), validate(createProductRouteSchema), asyncHandler(productRouteController.create));
productRouteRoutes.put("/:id", allowRoles("ADMIN", "PLANNER", "PRODUCTION_MANAGER"), validate(updateProductRouteSchema), asyncHandler(productRouteController.update));
