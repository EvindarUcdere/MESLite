import { z } from "zod";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeString = z.string().regex(/^\d{2}:\d{2}$/);

export const listShiftAssignmentsSchema = z.object({
  query: z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
    from: dateString.optional(),
    to: dateString.optional(),
    operatorId: z.string().uuid().optional()
  })
});

export const upsertShiftAssignmentSchema = z.object({
  body: z.object({
    operatorId: z.string().uuid(),
    shiftId: z.string().uuid(),
    workDate: dateString,
    startTime: timeString.optional(),
    endTime: timeString.optional(),
    status: z.enum(["PLANNED", "CONFIRMED", "ABSENT", "LEAVE"]).default("PLANNED"),
    note: z.string().max(500).optional()
  })
});

export const bulkUpsertShiftAssignmentsSchema = z.object({
  body: z.object({
    assignments: z.array(
      z.object({
        operatorId: z.string().uuid(),
        workDate: dateString
      })
    ).min(1).max(500),
    shiftId: z.string().uuid().optional(),
    status: z.enum(["EMPTY", "PLANNED", "CONFIRMED", "ABSENT", "LEAVE"]),
    note: z.string().max(500).optional()
  })
});

export const updateShiftAssignmentSchema = z.object({
  body: z.object({
    shiftId: z.string().uuid().optional(),
    startTime: timeString.optional(),
    endTime: timeString.optional(),
    status: z.enum(["PLANNED", "CONFIRMED", "ABSENT", "LEAVE"]).optional(),
    note: z.string().max(500).optional()
  })
});
