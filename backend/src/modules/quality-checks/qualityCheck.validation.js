import { z } from "zod";

const qualityCheckBody = z.object({
  operationId: z.string().uuid().optional(),
  workOrderId: z.string().uuid(),
  workOrderOperationId: z.string().uuid().optional(),
  status: z.enum(["PASSED", "FAILED", "PARTIAL"]),
  defectQuantity: z.number().int().min(0).default(0),
  defectReason: z.string().optional(),
  note: z.string().optional(),
  checkedAt: z.string().datetime().optional()
});

export const createQualityCheckSchema = z.object({ body: qualityCheckBody });
export const updateQualityCheckSchema = z.object({ body: qualityCheckBody.partial() });
