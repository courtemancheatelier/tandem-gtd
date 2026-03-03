import { z } from "zod";

export const createProjectSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  type: z.enum(["SEQUENTIAL", "PARALLEL", "SINGLE_ACTIONS"]).default("SEQUENTIAL"),
  childType: z.enum(["SEQUENTIAL", "PARALLEL"]).default("SEQUENTIAL"),
  outcome: z.string().optional(),
  targetDate: z.string().datetime().nullable().optional(),
  areaId: z.string().optional(),
  goalId: z.string().optional(),
  isSomedayMaybe: z.boolean().default(false),
  teamId: z.string().nullable().optional(),
});

export const updateProjectSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  status: z.enum(["ACTIVE", "ON_HOLD", "COMPLETED", "DROPPED", "SOMEDAY_MAYBE"]).optional(),
  type: z.enum(["SEQUENTIAL", "PARALLEL", "SINGLE_ACTIONS"]).optional(),
  childType: z.enum(["SEQUENTIAL", "PARALLEL"]).optional(),
  outcome: z.string().optional(),
  targetDate: z.string().datetime().nullable().optional(),
  areaId: z.string().nullable().optional(),
  goalId: z.string().nullable().optional(),
  isSomedayMaybe: z.boolean().optional(),
  velocityUnit: z.enum(["AUTO", "TASKS", "HOURS"]).optional(),
  sortOrder: z.number().int().optional(),
  teamId: z.string().nullable().optional(),
  version: z.number().int().positive().optional(),
});

export const createSubProjectSchema = z.object({
  title: z.string().min(1).max(200),
  type: z.enum(["SEQUENTIAL", "PARALLEL", "SINGLE_ACTIONS"]).default("SEQUENTIAL"),
  outcome: z.string().optional(),
  description: z.string().optional(),
});

export const moveProjectSchema = z.object({
  newParentId: z.string().nullable(),
});

export const captureBaselineSchema = z.object({
  name: z.string().min(1).max(200),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type CreateSubProjectInput = z.infer<typeof createSubProjectSchema>;
export type MoveProjectInput = z.infer<typeof moveProjectSchema>;
export const reorderChildrenSchema = z.object({
  childIds: z.array(z.string()).min(1),
});

export type CaptureBaselineInput = z.infer<typeof captureBaselineSchema>;
export type ReorderChildrenInput = z.infer<typeof reorderChildrenSchema>;
