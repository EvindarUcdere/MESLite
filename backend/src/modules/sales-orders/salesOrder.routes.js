import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { allowRoles } from "../../middlewares/role.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as salesOrderController from "./salesOrder.controller.js";
import { createSalesOrderSchema, createWorkOrdersFromSalesOrderSchema } from "./salesOrder.validation.js";

export const salesOrderRoutes = Router();

salesOrderRoutes.use(requireAuth);
salesOrderRoutes.get("/", allowRoles("ADMIN", "PLANNER", "PRODUCTION_MANAGER"), asyncHandler(salesOrderController.list));
salesOrderRoutes.get("/:id", allowRoles("ADMIN", "PLANNER", "PRODUCTION_MANAGER"), asyncHandler(salesOrderController.detail));
salesOrderRoutes.post("/", allowRoles("PLANNER"), validate(createSalesOrderSchema), asyncHandler(salesOrderController.create));
salesOrderRoutes.get("/:id/mrp", allowRoles("PLANNER", "PRODUCTION_MANAGER"), asyncHandler(salesOrderController.mrp));
salesOrderRoutes.post(
  "/:id/create-work-orders",
  allowRoles("PLANNER"),
  validate(createWorkOrdersFromSalesOrderSchema),
  asyncHandler(salesOrderController.createWorkOrders)
);
