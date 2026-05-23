import { z } from "zod";

const userBody = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["ADMIN", "PRODUCTION_MANAGER", "OPERATOR", "QUALITY_STAFF", "VIEWER"]).default("OPERATOR"),
  isActive: z.boolean().default(true)
});

export const createUserSchema = z.object({ body: userBody });

export const updateUserSchema = z.object({
  body: userBody
    .omit({ password: true })
    .partial()
    .extend({ password: z.string().min(8).optional() })
});

export const updateUserStatusSchema = z.object({
  body: z.object({
    isActive: z.boolean()
  })
});
