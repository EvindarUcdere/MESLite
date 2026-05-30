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
        message: "Resolution note is required when resolving an alert",
        path: ["resolutionNote"]
      });
    }
  })
});
