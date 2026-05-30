import { z } from "zod";

export const createProductionLogSchema = z.object({
  body: z.object({
    workOrderId: z.string().uuid(),
    machineId: z.string().uuid(),
    shiftId: z.string().uuid().optional(),
    producedQuantity: z.number().int().min(0),
    scrapQuantity: z.number().int().min(0).default(0),
    scrapReason: z.enum(["MATERIAL_DEFECT", "MACHINE_SETUP", "OPERATOR_ERROR", "PROCESS_DEVIATION", "QUALITY_REJECT", "OTHER"]).optional(),
    isCriticalAlert: z.boolean().default(false),
    alertSeverity: z.enum(["INFO", "WARNING", "CRITICAL"]).optional(),
    startedAt: z.string().datetime().optional(),
    endedAt: z.string().datetime().optional(),
    note: z.string().optional()
  }).superRefine((body, ctx) => {
    if (body.scrapQuantity > 0 && !body.scrapReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Scrap reason is required when scrap quantity is greater than zero",
        path: ["scrapReason"]
      });
    }
  })
});

export const updateProductionLogSchema = z.object({
  body: z.object({
    shiftId: z.string().uuid().optional(),
    producedQuantity: z.number().int().min(0).optional(),
    scrapQuantity: z.number().int().min(0).optional(),
    scrapReason: z.enum(["MATERIAL_DEFECT", "MACHINE_SETUP", "OPERATOR_ERROR", "PROCESS_DEVIATION", "QUALITY_REJECT", "OTHER"]).nullable().optional(),
    startedAt: z.string().datetime().optional(),
    endedAt: z.string().datetime().optional(),
    note: z.string().optional()
  })
});
