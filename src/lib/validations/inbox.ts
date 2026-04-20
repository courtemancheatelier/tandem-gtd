import { z } from "zod";

export const createInboxItemSchema = z.object({
  content: z.string().min(1).max(500),
  notes: z.string().max(5000).optional(),
  sourceLabel: z.string().max(50).optional(),
  externalLinkUrl: z.string().url().max(2000).optional(),
  externalLinkLabel: z.string().max(100).optional(),
});

export const updateInboxItemSchema = createInboxItemSchema.partial();

export type CreateInboxItemInput = z.infer<typeof createInboxItemSchema>;
export type UpdateInboxItemInput = z.infer<typeof updateInboxItemSchema>;
