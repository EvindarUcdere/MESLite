import { z } from "zod";

export const createOperationMessageSchema = z.object({
  body: z.object({
    message: z.string().min(2).max(1000),
    severity: z.enum(["INFO", "WARNING", "QUALITY_ALERT", "STOPPAGE"]).default("INFO")
  })
});
