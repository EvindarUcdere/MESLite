import { z } from "zod";

export const createMobileDebugLogSchema = z.object({
  body: z.object({
    category: z.string().trim().min(1).max(60).default("push"),
    step: z.string().trim().min(1).max(120),
    platform: z.string().trim().max(40).optional(),
    payload: z.record(z.any()).optional()
  })
});

