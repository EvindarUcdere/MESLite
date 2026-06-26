import { z } from "zod";

export const listProductionAlertsSchema = z.object({
  query: z.object({
    status: z.enum(["OPEN", "IN_REVIEW", "RESOLVED"]).optional()
  })
});

export const updateProductionAlertSchema = z.object({
  body: z.object({
    status: z.enum(["OPEN", "IN_REVIEW", "RESOLVED"]).optional(),
    assignedToId: z.string().uuid().nullable().optional(),
    resolutionNote: z.string().nullable().optional()
  }).superRefine((body, ctx) => {
    if (body.status === "RESOLVED" && !body.resolutionNote?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Uyarı kapatılırken çözüm notu zorunludur",
        path: ["resolutionNote"]
      });
    }
  })
});

export const decideQualityActionSchema = z.object({
  body: z.object({
    operationId: z.string().uuid().optional(),
    decision: z.enum(["REWORK_OPERATION", "SCRAP", "CONDITIONAL_ACCEPT"]),
    reworkOperationId: z.string().uuid().nullable().optional(),
    note: z.string().trim().min(3, "Kalite aksiyon notu zorunludur")
  }).superRefine((body, ctx) => {
    if (body.decision === "REWORK_OPERATION" && !body.reworkOperationId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Geri işleme aksiyonu için operasyon seçimi zorunludur",
        path: ["reworkOperationId"]
      });
    }
  })
});
