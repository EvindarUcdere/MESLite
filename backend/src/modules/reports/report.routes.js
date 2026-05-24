import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as reportController from "./report.controller.js";

export const reportRoutes = Router();

reportRoutes.use(requireAuth);
reportRoutes.get("/overview", asyncHandler(reportController.overview));
