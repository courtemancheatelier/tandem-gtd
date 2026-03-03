import { z } from "zod";

export const createHorizonReviewSchema = z.object({
  type: z.enum(["INITIAL_SETUP", "QUARTERLY", "ANNUAL"]),
});

export const updateHorizonReviewSchema = z.object({
  checklist: z
    .object({
      purpose: z.boolean().optional(),
      vision: z.boolean().optional(),
      goals: z.boolean().optional(),
      areas: z.boolean().optional(),
      projects: z.boolean().optional(),
      actions: z.boolean().optional(),
    })
    .optional(),
  notes: z
    .object({
      purpose: z.string().optional(),
      vision: z.string().optional(),
      goals: z.string().optional(),
      areas: z.string().optional(),
      projects: z.string().optional(),
      actions: z.string().optional(),
    })
    .optional(),
});

export type CreateHorizonReviewInput = z.infer<typeof createHorizonReviewSchema>;
export type UpdateHorizonReviewInput = z.infer<typeof updateHorizonReviewSchema>;
