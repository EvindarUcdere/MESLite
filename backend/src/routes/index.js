import { Router } from "express";
import { authRoutes } from "../modules/auth/auth.routes.js";
import { dashboardRoutes } from "../modules/dashboard/dashboard.routes.js";
import { machineRoutes } from "../modules/machines/machine.routes.js";
import { productRoutes } from "../modules/products/product.routes.js";
import { workOrderRoutes } from "../modules/work-orders/workOrder.routes.js";

export const apiRoutes = Router();

apiRoutes.use("/auth", authRoutes);
apiRoutes.use("/dashboard", dashboardRoutes);
apiRoutes.use("/machines", machineRoutes);
apiRoutes.use("/products", productRoutes);
apiRoutes.use("/work-orders", workOrderRoutes);
