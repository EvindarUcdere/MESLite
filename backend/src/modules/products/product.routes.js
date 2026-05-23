import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { allowRoles } from "../../middlewares/role.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as productController from "./product.controller.js";
import { createProductSchema, updateProductSchema } from "./product.validation.js";

export const productRoutes = Router();

productRoutes.use(requireAuth);
productRoutes.get("/", asyncHandler(productController.list));
productRoutes.get("/:id", asyncHandler(productController.detail));
productRoutes.post("/", allowRoles("ADMIN", "PRODUCTION_MANAGER"), validate(createProductSchema), asyncHandler(productController.create));
productRoutes.put("/:id", allowRoles("ADMIN", "PRODUCTION_MANAGER"), validate(updateProductSchema), asyncHandler(productController.update));
