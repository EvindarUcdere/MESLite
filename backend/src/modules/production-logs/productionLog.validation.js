import { z } from "zod";

const scrapReasonSchema = z.enum(["MATERIAL_DEFECT", "MACHINE_SETUP", "OPERATOR_ERROR", "PROCESS_DEVIATION", "QUALITY_REJECT", "OTHER"]);
const scrapDispositionSchema = z.enum(["PENDING_REVIEW", "REWORK", "SCRAP", "REPRODUCE", "CONDITIONAL_ACCEPT"]);

function validateScrapDecision(body, ctx) {
  if (body.scrapQuantity > 0 && !body.scrapReason) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Fire adedi sifirdan buyukse fire nedeni zorunludur",
      path: ["scrapReason"]
    });
  }

  if (body.scrapQuantity > 0 && !body.scrapDisposition) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Fire adedi sifirdan buyukse fire karari zorunludur",
      path: ["scrapDisposition"]
    });
  }

  if (body.scrapQuantity === 0 && (body.scrapDisposition || body.scrapResolutionQuantity > 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Fire karari yalnizca fire adedi girildiginde kullanilabilir",
      path: ["scrapDisposition"]
    });
  }

  if (body.scrapDisposition === "REPRODUCE" && body.scrapResolutionQuantity <= 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Yeniden uretim karari icin yeniden uretilecek adet girilmelidir",
      path: ["scrapResolutionQuantity"]
    });
  }

  if (body.scrapResolutionQuantity > body.scrapQuantity) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Yeniden uretilecek adet fire adedini asamaz",
      path: ["scrapResolutionQuantity"]
    });
  }
}

export const createProductionLogSchema = z.object({
  body: z.object({
    workOrderId: z.string().uuid(),
    workOrderOperationId: z.string().uuid().optional(),
    machineId: z.string().uuid(),
    shiftId: z.string().uuid().optional(),
    producedQuantity: z.number().int().min(0),
    scrapQuantity: z.number().int().min(0).default(0),
    scrapReason: scrapReasonSchema.optional(),
    scrapDisposition: scrapDispositionSchema.optional(),
    scrapResolutionQuantity: z.number().int().min(0).default(0),
    scrapDispositionNote: z.string().max(1000).optional(),
    isCriticalAlert: z.boolean().default(false),
    alertSeverity: z.enum(["INFO", "WARNING", "CRITICAL"]).optional(),
    startedAt: z.string().datetime().optional(),
    endedAt: z.string().datetime().optional(),
    note: z.string().optional()
  }).superRefine(validateScrapDecision)
});

export const updateProductionLogSchema = z.object({
  body: z.object({
    shiftId: z.string().uuid().optional(),
    producedQuantity: z.number().int().min(0).optional(),
    scrapQuantity: z.number().int().min(0).optional(),
    scrapReason: scrapReasonSchema.nullable().optional(),
    scrapDisposition: scrapDispositionSchema.nullable().optional(),
    scrapResolutionQuantity: z.number().int().min(0).optional(),
    scrapDispositionNote: z.string().max(1000).nullable().optional(),
    startedAt: z.string().datetime().optional(),
    endedAt: z.string().datetime().optional(),
    note: z.string().optional()
  })
});
