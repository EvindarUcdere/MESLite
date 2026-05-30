import { z } from "zod";

const routeOperationSchema = z.object({
  operationName: z.string().min(2),
  sequenceNo: z.number().int().min(1),
  defaultMachineId: z.string().uuid().nullable().optional(),
  estimatedMinutes: z.number().int().min(1).nullable().optional(),
  requiresQualityCheck: z.boolean().default(false)
});

export const createProductRouteSchema = z.object({
  body: z.object({
    productId: z.string().uuid(),
    name: z.string().min(2),
    description: z.string().optional(),
    isActive: z.boolean().default(true),
    operations: z.array(routeOperationSchema).min(1)
  })
});

export const updateProductRouteSchema = z.object({
  body: z.object({
    productId: z.string().uuid().optional(),
    name: z.string().min(2).optional(),
    description: z.string().nullable().optional(),
    isActive: z.boolean().optional(),
    operations: z.array(routeOperationSchema).min(1).optional()
  })
});
