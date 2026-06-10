import { z } from "zod";

const monthString = z.string().regex(/^\d{4}-\d{2}$/);

export const upsertGroupSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(120),
    description: z.string().max(500).optional(),
    isActive: z.boolean().optional(),
    operatorIds: z.array(z.string().uuid()).default([])
  })
});

export const updateGroupSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(120).optional(),
    description: z.string().max(500).optional(),
    isActive: z.boolean().optional(),
    operatorIds: z.array(z.string().uuid()).optional()
  })
});

export const upsertTemplateSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(120),
    description: z.string().max(500).optional(),
    pattern: z.enum(["WEEKDAYS", "SIX_DAYS", "EVERY_DAY", "FOUR_ON_TWO_OFF"]).default("SIX_DAYS"),
    shiftId: z.string().uuid(),
    groupId: z.string().uuid().optional(),
    startOffset: z.number().int().min(0).max(30).default(0),
    isActive: z.boolean().optional()
  })
});

export const updateTemplateSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(120).optional(),
    description: z.string().max(500).optional(),
    pattern: z.enum(["WEEKDAYS", "SIX_DAYS", "EVERY_DAY", "FOUR_ON_TWO_OFF"]).optional(),
    shiftId: z.string().uuid().optional(),
    groupId: z.string().uuid().nullable().optional(),
    startOffset: z.number().int().min(0).max(30).optional(),
    isActive: z.boolean().optional()
  })
});

export const generateMonthlyPlanSchema = z.object({
  body: z.object({
    month: monthString,
    groupId: z.string().uuid(),
    templateId: z.string().uuid(),
    overwrite: z.boolean().default(false),
    note: z.string().max(500).optional()
  })
});
