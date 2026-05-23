import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as authController from "./auth.controller.js";
import { loginSchema } from "./auth.validation.js";

export const authRoutes = Router();

authRoutes.post("/login", validate(loginSchema), asyncHandler(authController.login));
authRoutes.get("/me", requireAuth, authController.me);
