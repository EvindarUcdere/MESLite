import { z } from "zod";

const shiftBody = z.object({
  name: z.string().min(2),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  isActive: z.boolean().default(true)
});

export const createShiftSchema = z.object({ body: shiftBody });
export const updateShiftSchema = z.object({ body: shiftBody.partial() });
