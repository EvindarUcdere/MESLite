import { z } from "zod";

export const listOperatorMachineSkillsSchema = z.object({
  query: z.object({
    operatorId: z.string().uuid().optional(),
    machineId: z.string().uuid().optional()
  })
});

export const upsertOperatorMachineSkillSchema = z.object({
  body: z.object({
    operatorId: z.string().uuid(),
    machineId: z.string().uuid(),
    level: z.enum(["BASIC", "ADVANCED", "CERTIFIED"]).default("BASIC"),
    isActive: z.boolean().default(true),
    note: z.string().max(500).optional()
  })
});

export const updateOperatorMachineSkillSchema = z.object({
  body: z.object({
    level: z.enum(["BASIC", "ADVANCED", "CERTIFIED"]).optional(),
    isActive: z.boolean().optional(),
    note: z.string().max(500).optional()
  })
});
