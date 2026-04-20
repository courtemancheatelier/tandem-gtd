import { z } from "zod";

export const createTaskSchema = z.object({
  title: z.string().min(1).max(500),
  notes: z.string().optional(),
  projectId: z.string().optional(),
  contextId: z.string().optional(),
  estimatedMins: z.number().int().positive().optional(),
  energyLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  scheduledDate: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional(),
  sortOrder: z.number().int().optional(),
  predecessorIds: z.array(z.string()).optional(),
  isMilestone: z.boolean().optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  notes: z.string().optional(),
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "WAITING", "COMPLETED", "DROPPED"]).optional(),
  projectId: z.string().nullable().optional(),
  contextId: z.string().nullable().optional(),
  estimatedMins: z.number().int().positive().nullable().optional(),
  energyLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).nullable().optional(),
  scheduledDate: z.string().datetime().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  sortOrder: z.number().int().optional(),
  isNextAction: z.boolean().optional(),
  isMilestone: z.boolean().optional(),
  percentComplete: z.number().int().min(0).max(100).optional(),
  actualMinutes: z.number().int().positive().nullable().optional(),
  assignedToId: z.string().nullable().optional(),
  externalLinkUrl: z.string().url().nullable().optional(),
  externalLinkLabel: z.string().max(100).nullable().optional(),
  version: z.number().int().positive().optional(),
});

export const reorderTasksSchema = z.object({
  taskIds: z.array(z.string()).min(1),
});

export const addDependencySchema = z.object({
  predecessorId: z.string().min(1),
  type: z.enum(["FINISH_TO_START", "START_TO_START", "FINISH_TO_FINISH", "START_TO_FINISH"]).default("FINISH_TO_START"),
  lagMinutes: z.number().int().default(0),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
