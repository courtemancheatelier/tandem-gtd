import { z } from "zod";

// Schedule format validation:
// "daily", "weekdays", "weekly:0"-"weekly:6", "biweekly:0"-"biweekly:6", "monthly:1"-"monthly:31",
// "quarterly:1"-"quarterly:31", "yearly:1-12:1-31", "every_n_days:1"-"every_n_days:999"
const schedulePattern = /^(daily|weekdays|weekly:[0-6]|biweekly:[0-6]|monthly:([1-9]|[12]\d|3[01])|quarterly:([1-9]|[12]\d|3[01])|yearly:([1-9]|1[0-2]):([1-9]|[12]\d|3[01])|every_n_days:([1-9]\d{0,2}))$/;

export const scheduleExpressionSchema = z
  .string()
  .regex(schedulePattern, "Invalid schedule format. Use: daily, weekdays, weekly:0-6, biweekly:0-6, monthly:1-31, quarterly:1-31, yearly:1-12:1-31, or every_n_days:1-999");

export const createRecurringTemplateSchema = z.object({
  title: z.string().min(1, "Title is required").max(500),
  description: z.string().max(2000).optional(),
  cronExpression: scheduleExpressionSchema,
  nextDue: z.string().datetime().optional(),
  isActive: z.boolean().optional(),
  color: z.string().max(20).optional(),
  estimatedMins: z.number().int().positive().optional(),
  areaId: z.string().min(1).optional(),
  goalId: z.string().min(1).optional(),
  taskDefaults: z
    .object({
      projectId: z.string().min(1).optional(),
      contextId: z.string().min(1).optional(),
      energyLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
      estimatedMins: z.number().int().positive().optional(),
    })
    .optional(),
});

export const updateRecurringTemplateSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(2000).nullable().optional(),
  cronExpression: scheduleExpressionSchema.optional(),
  nextDue: z.string().datetime().nullable().optional(),
  isActive: z.boolean().optional(),
  color: z.string().max(20).nullable().optional(),
  estimatedMins: z.number().int().positive().nullable().optional(),
  areaId: z.string().nullable().optional(),
  goalId: z.string().nullable().optional(),
  taskDefaults: z
    .object({
      projectId: z.string().nullable().optional(),
      contextId: z.string().nullable().optional(),
      energyLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).nullable().optional(),
      estimatedMins: z.number().int().positive().nullable().optional(),
    })
    .nullable()
    .optional(),
});

export type CreateRecurringTemplateInput = z.infer<typeof createRecurringTemplateSchema>;
export type UpdateRecurringTemplateInput = z.infer<typeof updateRecurringTemplateSchema>;
