import { z } from "zod";

export const registerPushTokenSchema = z.object({
  body: z.object({
    token: z.string().trim().min(10),
    platform: z.enum(["ios", "android", "web", "unknown"]).default("unknown"),
    deviceName: z.string().trim().max(120).optional()
  })
});
