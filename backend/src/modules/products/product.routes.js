import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { allowRoles } from "../../middlewares/role.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as productController from "./product.controller.js";
import { createProductSchema, replaceProductBomSchema, updateProductSchema } from "./product.validation.js";

export const productRoutes = Router();

productRoutes.use(requireAuth);
productRoutes.get("/", asyncHandler(productController.list));
productRoutes.get("/:id", asyncHandler(productController.detail));
productRoutes.post("/", allowRoles("ADMIN", "PLANNER", "PRODUCTION_MANAGER"), validate(createProductSchema), asyncHandler(productController.create));
productRoutes.put("/:id", allowRoles("ADMIN", "PLANNER", "PRODUCTION_MANAGER"), validate(updateProductSchema), asyncHandler(productController.update));
productRoutes.put("/:id/bom", allowRoles("ADMIN", "PLANNER", "PRODUCTION_MANAGER"), validate(replaceProductBomSchema), asyncHandler(productController.replaceBom));
