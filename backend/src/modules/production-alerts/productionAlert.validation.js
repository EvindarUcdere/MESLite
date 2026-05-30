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
  })
});
