import { z } from "zod";

const productBody = z.object({
  code: z.string().min(2),
  name: z.string().min(2),
  unit: z.string().min(1).default("pcs"),
  targetCycleTime: z.number().int().positive().optional()
});

export const bomItemSchema = z.object({
  componentProductId: z.string().uuid(),
  quantity: z.coerce.number().positive(),
  unit: z.string().min(1),
  wastePercent: z.coerce.number().min(0).max(100).default(0),
  note: z.string().max(500).optional().nullable()
});

export const createProductSchema = z.object({ body: productBody });
export const updateProductSchema = z.object({ body: productBody.partial() });
export const replaceProductBomSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    items: z.array(bomItemSchema).max(100)
  })
});
