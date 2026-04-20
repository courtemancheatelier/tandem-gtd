import { z } from "zod";

export const createContextSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  icon: z.string().max(30).optional(),
  sortOrder: z.number().int().optional(),
});

export const updateContextSchema = createContextSchema.partial();

export type CreateContextInput = z.infer<typeof createContextSchema>;
export type UpdateContextInput = z.infer<typeof updateContextSchema>;
