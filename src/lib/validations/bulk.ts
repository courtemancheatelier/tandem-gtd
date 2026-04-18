import { z } from "zod";

export const bulkTaskUpdateSchema = z.object({
  taskIds: z
    .array(z.string().min(1))
    .min(1, "At least 1 task ID required")
    .max(100, "Maximum 100 tasks per batch"),
  updates: z.object({
    contextId: z.string().nullable().optional(),
    energyLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).nullable().optional(),
    estimatedMins: z.number().int().positive().nullable().optional(),
    status: z.enum(["NOT_STARTED", "IN_PROGRESS"]).optional(),
    dueDate: z.string().datetime().nullable().optional(),
    assignedToId: z.string().nullable().optional(),
    projectId: z.string().nullable().optional(),
  }).refine(
    (u) => u.contextId !== undefined || u.energyLevel !== undefined || u.estimatedMins !== undefined || u.status !== undefined || u.dueDate !== undefined || u.assignedToId !== undefined || u.projectId !== undefined,
    { message: "At least one update field required" }
  ),
  versions: z.record(z.string(), z.number().int().positive()).optional(),
});

export type BulkTaskUpdateInput = z.infer<typeof bulkTaskUpdateSchema>;

export const bulkProjectUpdateSchema = z.object({
  projectIds: z
    .array(z.string().min(1))
    .min(1, "At least 1 project ID required")
    .max(50, "Maximum 50 projects per batch"),
  updates: z.object({
    status: z.enum(["ACTIVE", "ON_HOLD", "COMPLETED", "DROPPED"]).optional(),
    areaId: z.string().nullable().optional(),
  }).refine(
    (u) => u.status !== undefined || u.areaId !== undefined,
    { message: "At least one update field required" }
  ),
});

export type BulkProjectUpdateInput = z.infer<typeof bulkProjectUpdateSchema>;
