import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as mobileDebugLogController from "./mobileDebugLog.controller.js";
import { createMobileDebugLogSchema } from "./mobileDebugLog.validation.js";

export const mobileDebugLogRoutes = Router();

mobileDebugLogRoutes.use(requireAuth);
mobileDebugLogRoutes.get("/", asyncHandler(mobileDebugLogController.list));
mobileDebugLogRoutes.post("/", validate(createMobileDebugLogSchema), asyncHandler(mobileDebugLogController.create));

