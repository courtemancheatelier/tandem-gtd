import { z } from "zod";

export const createGoalSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().max(2000).optional(),
  horizon: z
    .enum(["RUNWAY", "HORIZON_1", "HORIZON_2", "HORIZON_3", "HORIZON_4", "HORIZON_5"])
    .default("HORIZON_3"),
  status: z
    .enum(["NOT_STARTED", "IN_PROGRESS", "ACHIEVED", "DEFERRED"])
    .default("NOT_STARTED"),
  targetDate: z.string().datetime().optional().nullable(),
  progress: z.number().int().min(0).max(100).default(0),
  areaId: z.string().optional().nullable(),
});

export const updateGoalSchema = z.object({
  title: z.string().min(1, "Title is required").max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  horizon: z
    .enum(["RUNWAY", "HORIZON_1", "HORIZON_2", "HORIZON_3", "HORIZON_4", "HORIZON_5"])
    .optional(),
  status: z
    .enum(["NOT_STARTED", "IN_PROGRESS", "ACHIEVED", "DEFERRED"])
    .optional(),
  targetDate: z.string().datetime().optional().nullable(),
  progress: z.number().int().min(0).max(100).optional(),
  areaId: z.string().optional().nullable(),
});

export type CreateGoalInput = z.infer<typeof createGoalSchema>;
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;
