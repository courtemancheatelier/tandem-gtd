import { z } from "zod";

export const createWaitingForSchema = z.object({
  description: z.string().min(1).max(500),
  person: z.string().min(1).max(100),
  dueDate: z.string().datetime().optional().nullable(),
  followUpDate: z.string().datetime().optional().nullable(),
});

export const updateWaitingForSchema = createWaitingForSchema.partial().extend({
  isResolved: z.boolean().optional(),
});

export type CreateWaitingForInput = z.infer<typeof createWaitingForSchema>;
export type UpdateWaitingForInput = z.infer<typeof updateWaitingForSchema>;
