import { z } from "zod";

export const createProjectTemplateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  type: z
    .enum(["SEQUENTIAL", "PARALLEL", "SINGLE_ACTIONS"])
    .default("SEQUENTIAL"),
  outcome: z.string().max(500).optional(),
  icon: z.string().max(50).optional(),
  variables: z.array(z.string().max(50)).max(20).optional().default([]),
  taskTemplates: z
    .array(
      z.object({
        title: z.string().min(1).max(500),
        notes: z.string().max(5000).optional(),
        estimatedMins: z.number().int().positive().optional(),
        energyLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
        contextName: z.string().max(50).optional(),
        sortOrder: z.number().int().optional(),
      })
    )
    .max(100)
    .optional(),
});

export const instantiateTemplateSchema = z.object({
  variables: z.record(z.string(), z.string().max(200)).optional().default({}),
  projectTitle: z.string().min(1).max(200).optional(),
  targetDate: z.string().datetime().optional(),
  areaId: z.string().optional(),
  goalId: z.string().optional(),
  teamId: z.string().optional(),
});

export const saveAsTemplateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  teamId: z.string().min(1).optional(),
});

export type CreateProjectTemplateInput = z.infer<
  typeof createProjectTemplateSchema
>;
export type InstantiateTemplateInput = z.infer<
  typeof instantiateTemplateSchema
>;
export type SaveAsTemplateInput = z.infer<typeof saveAsTemplateSchema>;
