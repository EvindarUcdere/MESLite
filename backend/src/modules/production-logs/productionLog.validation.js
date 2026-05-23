import { z } from "zod";

export const createProductionLogSchema = z.object({
  body: z.object({
    workOrderId: z.string().uuid(),
    machineId: z.string().uuid(),
    shiftId: z.string().uuid().optional(),
    producedQuantity: z.number().int().min(0),
    scrapQuantity: z.number().int().min(0).default(0),
    startedAt: z.string().datetime().optional(),
    endedAt: z.string().datetime().optional(),
    note: z.string().optional()
  })
});

export const updateProductionLogSchema = z.object({
  body: z.object({
    shiftId: z.string().uuid().optional(),
    producedQuantity: z.number().int().min(0).optional(),
    scrapQuantity: z.number().int().min(0).optional(),
    startedAt: z.string().datetime().optional(),
    endedAt: z.string().datetime().optional(),
    note: z.string().optional()
  })
});
