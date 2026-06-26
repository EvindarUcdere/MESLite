import { z } from "zod";

export const pauseOperationSchema = z.object({
  body: z.object({
    operationId: z.string().uuid().optional(),
    reason: z.enum(["MACHINE_FAILURE", "MATERIAL_WAITING", "QUALITY_WAITING", "MAINTENANCE", "SETUP", "OPERATOR_BREAK", "OTHER"]),
    note: z.string().max(1000).optional()
  })
});

export const createOperationMessageSchema = z.object({
  body: z.object({
    operationId: z.string().uuid().optional(),
    message: z.string().min(2).max(1000),
    severity: z.enum(["INFO", "WARNING", "QUALITY_ALERT", "STOPPAGE"]).default("INFO")
  })
});
