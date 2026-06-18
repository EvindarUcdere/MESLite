import { z } from "zod";

export const createStockMovementSchema = z.object({
  body: z.object({
    productId: z.string().uuid(),
    type: z.enum(["PURCHASE_IN", "PRODUCTION_IN", "CONSUMPTION_OUT", "SCRAP_OUT", "ADJUSTMENT_IN", "ADJUSTMENT_OUT"]),
    quantity: z.coerce.number().positive(),
    referenceType: z.string().max(80).optional(),
    referenceId: z.string().max(120).optional(),
    note: z.string().max(1000).optional()
  })
});

export const updateStockItemSchema = z.object({
  params: z.object({ productId: z.string().uuid() }),
  body: z.object({
    minimumQuantity: z.coerce.number().min(0).optional(),
    reservedQuantity: z.coerce.number().min(0).optional(),
    location: z.string().max(120).optional().nullable()
  })
});
