import { z } from "zod";

export const createWorkOrderSchema = z.object({
  body: z.object({
    orderNo: z.string().min(2),
    productId: z.string().uuid(),
    machineId: z.string().uuid().optional(),
    assignedOperatorId: z.string().uuid().optional(),
    plannedQuantity: z.number().int().positive(),
    plannedStartDate: z.string().datetime().optional(),
    plannedEndDate: z.string().datetime().optional()
  })
});

export const updateStatusSchema = z.object({
  body: z.object({
    status: z.enum(["PLANNED", "IN_PROGRESS", "PAUSED", "COMPLETED", "CANCELLED"])
  })
});

export const assignOperatorSchema = z.object({
  body: z.object({
    operatorId: z.string().uuid()
  })
});

export const assignMachineSchema = z.object({
  body: z.object({
    machineId: z.string().uuid()
  })
});
