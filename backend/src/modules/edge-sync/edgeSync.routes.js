import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as edgeSyncController from "./edgeSync.controller.js";

export const edgeSyncRoutes = Router();

edgeSyncRoutes.post("/operations", asyncHandler(edgeSyncController.receiveOperation));
