import { z } from "zod";

export const exportQuerySchema = z.object({
  format: z.enum(["json", "csv"]).default("json"),
  scope: z
    .enum([
      "all",
      "tasks",
      "projects",
      "inbox",
      "contexts",
      "areas",
      "goals",
      "horizons",
      "wiki",
      "routine-logs",
    ])
    .default("all"),
  includeCompleted: z.coerce.boolean().default(true),
});

export type ExportQuery = z.infer<typeof exportQuerySchema>;

export const importUploadSchema = z.object({
  source: z.enum(["tandem_json", "todoist_csv", "generic_csv"]),
});

export const importMappingSchema = z.object({
  mapping: z.record(z.string(), z.string()),
});

export const importConfirmSchema = z.object({
  duplicateAction: z.enum(["skip", "overwrite"]).default("skip"),
});
