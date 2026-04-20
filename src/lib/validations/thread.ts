import { z } from "zod";

export const createThreadSchema = z.object({
  purpose: z.enum(["QUESTION", "BLOCKER", "UPDATE", "FYI"]),
  title: z.string().min(1).max(500),
  message: z.string().min(1).max(5000),
  taskId: z.string().optional(),
  projectId: z.string().optional(),
  mentions: z.array(z.string()).max(50).optional(), // user IDs
  setTaskWaiting: z.boolean().optional(), // for BLOCKER threads
}).refine(
  (data) => (data.taskId && !data.projectId) || (!data.taskId && data.projectId),
  { message: "Exactly one of taskId or projectId must be provided" }
);

export const addMessageSchema = z.object({
  content: z.string().min(1).max(5000),
  mentions: z.array(z.string()).max(50).optional(),
});

export const updateMessageSchema = z.object({
  content: z.string().min(1).max(5000),
});

export const updateThreadSchema = z.object({
  title: z.string().min(1).max(500).optional(),
});

export const reactionSchema = z.object({
  emoji: z.string().min(1).max(8),
});

export type CreateThreadInput = z.infer<typeof createThreadSchema>;
export type AddMessageInput = z.infer<typeof addMessageSchema>;
export type UpdateMessageInput = z.infer<typeof updateMessageSchema>;
export type ReactionInput = z.infer<typeof reactionSchema>;
