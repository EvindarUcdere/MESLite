import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as pushTokenController from "./pushToken.controller.js";
import { registerPushTokenSchema } from "./pushToken.validation.js";

export const pushTokenRoutes = Router();

pushTokenRoutes.use(requireAuth);
pushTokenRoutes.post("/", validate(registerPushTokenSchema), asyncHandler(pushTokenController.register));
pushTokenRoutes.delete("/", asyncHandler(pushTokenController.deactivate));
