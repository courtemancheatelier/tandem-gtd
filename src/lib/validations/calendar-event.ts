import { z } from "zod";

export const createCalendarEventSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  eventType: z.enum(["TIME_SPECIFIC", "DAY_SPECIFIC", "INFORMATION", "TIME_BLOCK"]).default("TIME_SPECIFIC"),
  date: z.string().min(1, "Date is required").regex(/^\d{4}-\d{2}-\d{2}/, "Date must be ISO format (YYYY-MM-DD)"),
  startTime: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "Must be ISO datetime").optional().nullable(),
  endTime: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "Must be ISO datetime").optional().nullable(),
  allDay: z.boolean().optional().default(false),
  location: z.string().max(500).optional().nullable(),
  description: z.string().max(5000).optional().nullable(),
  reminderMinutes: z.number().int().min(0).max(10080).optional().nullable(),
  recurrenceRule: z.string().max(500).regex(/^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)/, "Must be a valid RRULE starting with FREQ=").optional().nullable(),
  taskId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
});

export const updateCalendarEventSchema = createCalendarEventSchema.partial();

export const createTimeBlockSchema = z.object({
  taskId: z.string().min(1, "Task is required"),
  date: z.string().min(1, "Date is required"),
  startTime: z.string().min(1, "Start time is required"),
  durationMinutes: z.number().int().min(15).max(480),
});

export type CreateCalendarEventInput = z.infer<typeof createCalendarEventSchema>;
export type UpdateCalendarEventInput = z.infer<typeof updateCalendarEventSchema>;
export type CreateTimeBlockInput = z.infer<typeof createTimeBlockSchema>;
