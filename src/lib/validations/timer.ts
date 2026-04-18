import { z } from "zod";

export const startTimerSchema = z.object({
  taskId: z.string().min(1, "taskId is required"),
});

export const adjustTimerSchema = z.object({
  adjustedMinutes: z.number().int().min(0, "Minutes must be non-negative").max(1440, "Maximum 24 hours"),
});

export type StartTimerInput = z.infer<typeof startTimerSchema>;
export type AdjustTimerInput = z.infer<typeof adjustTimerSchema>;
