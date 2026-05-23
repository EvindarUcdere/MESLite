import { z } from "zod";

const productionLineBody = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  isActive: z.boolean().default(true)
});

export const createProductionLineSchema = z.object({ body: productionLineBody });
export const updateProductionLineSchema = z.object({ body: productionLineBody.partial() });
