import { z } from "zod";

const machineBody = z.object({
  code: z.string().min(2),
  name: z.string().min(2),
  productionLineId: z.string().uuid(),
  status: z.enum(["IDLE", "RUNNING", "STOPPED", "MAINTENANCE"]).default("IDLE"),
  isActive: z.boolean().default(true)
});

export const createMachineSchema = z.object({ body: machineBody });
export const updateMachineSchema = z.object({ body: machineBody.partial() });

export const updateMachineStatusSchema = z.object({
  body: z.object({
    status: z.enum(["IDLE", "RUNNING", "STOPPED", "MAINTENANCE"]),
    reason: z.string().optional()
  }).superRefine((body, ctx) => {
    if (["STOPPED", "MAINTENANCE"].includes(body.status) && !body.reason?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Duruş veya bakım durumundaki makineler için neden zorunludur",
        path: ["reason"]
      });
    }
  })
});
