import { z } from "zod";

export const updateMachineStatusSchema = z.object({
  body: z.object({
    status: z.enum(["IDLE", "RUNNING", "STOPPED", "MAINTENANCE"]),
    reason: z.string().optional()
  })
});
