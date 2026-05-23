import { z } from "zod";

const qualityCheckBody = z.object({
  workOrderId: z.string().uuid(),
  status: z.enum(["PASSED", "FAILED", "PARTIAL"]),
  defectQuantity: z.number().int().min(0).default(0),
  defectReason: z.string().optional(),
  note: z.string().optional(),
  checkedAt: z.string().datetime().optional()
});

export const createQualityCheckSchema = z.object({ body: qualityCheckBody });
export const updateQualityCheckSchema = z.object({ body: qualityCheckBody.partial() });
