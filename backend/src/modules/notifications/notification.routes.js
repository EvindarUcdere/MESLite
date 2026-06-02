import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as notificationController from "./notification.controller.js";

export const notificationRoutes = Router();

notificationRoutes.use(requireAuth);
notificationRoutes.get("/", asyncHandler(notificationController.list));
notificationRoutes.patch("/read-all", asyncHandler(notificationController.markAllRead));
notificationRoutes.patch("/:id/read", asyncHandler(notificationController.markRead));
