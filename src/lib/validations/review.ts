import { z } from "zod";

export const createReviewSchema = z.object({
  notes: z.string().optional(),
});

export const updateReviewSchema = z.object({
  notes: z.string().optional(),
  checklist: z
    .object({
      getClear: z.boolean().optional(),
      getCurrent: z.boolean().optional(),
      getCreative: z.boolean().optional(),
    })
    .optional(),
  status: z.enum(["IN_PROGRESS", "COMPLETED"]).optional(),
  aiCoachUsed: z.boolean().optional(),
  aiSummary: z.string().optional(),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>;
export type UpdateReviewInput = z.infer<typeof updateReviewSchema>;
