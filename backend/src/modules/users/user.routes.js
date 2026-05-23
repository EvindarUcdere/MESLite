import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { allowRoles } from "../../middlewares/role.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as userController from "./user.controller.js";
import { createUserSchema, updateUserSchema, updateUserStatusSchema } from "./user.validation.js";

export const userRoutes = Router();

userRoutes.use(requireAuth, allowRoles("ADMIN"));
userRoutes.get("/", asyncHandler(userController.list));
userRoutes.get("/:id", asyncHandler(userController.detail));
userRoutes.post("/", validate(createUserSchema), asyncHandler(userController.create));
userRoutes.put("/:id", validate(updateUserSchema), asyncHandler(userController.update));
userRoutes.patch("/:id/status", validate(updateUserStatusSchema), asyncHandler(userController.updateStatus));
