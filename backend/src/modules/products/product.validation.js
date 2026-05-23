import { z } from "zod";

const productBody = z.object({
  code: z.string().min(2),
  name: z.string().min(2),
  unit: z.string().min(1).default("pcs"),
  targetCycleTime: z.number().int().positive().optional()
});

export const createProductSchema = z.object({ body: productBody });
export const updateProductSchema = z.object({ body: productBody.partial() });
