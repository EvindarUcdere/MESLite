import { z } from "zod";

const userBody = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  employeeCode: z.string().trim().min(1).optional().or(z.literal("")),
  phone: z.string().trim().min(1).optional().or(z.literal("")),
  department: z.string().trim().min(1).optional().or(z.literal("")),
  position: z.string().trim().min(1).optional().or(z.literal("")),
  hireDate: z.string().date().optional().or(z.literal("")),
  terminationDate: z.string().date().optional().or(z.literal("")),
  emergencyContactName: z.string().trim().min(1).optional().or(z.literal("")),
  emergencyContactPhone: z.string().trim().min(1).optional().or(z.literal("")),
  role: z.enum(["ADMIN", "PLANNER", "PRODUCTION_MANAGER", "OPERATOR", "QUALITY_STAFF", "VIEWER"]).default("OPERATOR"),
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
