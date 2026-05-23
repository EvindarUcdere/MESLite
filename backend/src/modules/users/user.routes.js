import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { allowRoles } from "../../middlewares/role.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as userController from "./user.controller.js";
import { createUserSchema, updateUserSchema, updateUserStatusSchema } from "./user.validation.js";

export const userRoutes = Router();

userRoutes.use(requireAuth);
userRoutes.get("/", allowRoles("ADMIN", "PRODUCTION_MANAGER"), asyncHandler(userController.list));
userRoutes.get("/:id", allowRoles("ADMIN", "PRODUCTION_MANAGER"), asyncHandler(userController.detail));
userRoutes.post("/", allowRoles("ADMIN"), validate(createUserSchema), asyncHandler(userController.create));
userRoutes.put("/:id", allowRoles("ADMIN"), validate(updateUserSchema), asyncHandler(userController.update));
userRoutes.patch("/:id/status", allowRoles("ADMIN"), validate(updateUserStatusSchema), asyncHandler(userController.updateStatus));
