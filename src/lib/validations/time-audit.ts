import { z } from "zod";

export const createChallengeSchema = z.object({
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
});

export const updateChallengeSchema = z.object({
  status: z.enum(["PAUSED", "COMPLETED", "ABANDONED"]),
});

export const createEntrySchema = z.object({
  intervalStart: z.string().datetime(),
  intervalEnd: z.string().datetime(),
  tags: z.array(z.string()).min(1, "At least one tag is required"),
  note: z.string().max(500).optional(),
  taskId: z.string().optional(),
});

export const updateEntrySchema = z.object({
  tags: z.array(z.string()).min(1).optional(),
  note: z.string().max(500).nullable().optional(),
  taskId: z.string().nullable().optional(),
});

export type CreateChallengeInput = z.infer<typeof createChallengeSchema>;
export type UpdateChallengeInput = z.infer<typeof updateChallengeSchema>;
export type CreateEntryInput = z.infer<typeof createEntrySchema>;
export type UpdateEntryInput = z.infer<typeof updateEntrySchema>;
