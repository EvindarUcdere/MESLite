import { z } from "zod";

const salesOrderItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
  unit: z.string().min(1).default("adet"),
  note: z.string().max(1000).optional()
});

export const createSalesOrderSchema = z.object({
  body: z.object({
    orderNo: z.string().min(2),
    customerName: z.string().min(2),
    requestedDate: z.string().datetime().optional(),
    dueDate: z.string().datetime().optional(),
    note: z.string().max(1000).optional(),
    items: z.array(salesOrderItemSchema).min(1)
  })
});

export const createWorkOrdersFromSalesOrderSchema = z.object({
  body: z.object({
    plannedStartDate: z.string().datetime().optional(),
    plannedEndDate: z.string().datetime().optional()
  })
});
