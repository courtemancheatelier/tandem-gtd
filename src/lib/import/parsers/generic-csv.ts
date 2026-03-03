import { parseCsv } from "./csv-utils";
import type { ImportPreview } from "../types";
import { emptyPreview } from "../types";

/** Tandem fields that can be mapped to from CSV columns */
export const TANDEM_TASK_FIELDS = [
  { value: "title", label: "Title", required: true },
  { value: "notes", label: "Notes" },
  { value: "status", label: "Status" },
  { value: "projectTitle", label: "Project" },
  { value: "contextName", label: "Context" },
  { value: "dueDate", label: "Due Date" },
  { value: "energyLevel", label: "Energy Level" },
  { value: "estimatedMins", label: "Estimated Minutes" },
  { value: "", label: "(skip)" },
] as const;

/**
 * Parse a generic CSV with a user-defined column mapping.
 *
 * If mapping is empty, returns an empty preview — caller should
 * use the CSV headers to build a mapping UI.
 */
export function parseGenericCsv(
  content: string,
  mapping: Record<string, string>
): ImportPreview {
  const rows = parseCsv(content);
  if (rows.length === 0) {
    throw new Error("Empty CSV file or no data rows found.");
  }

  const preview = emptyPreview();

  // If no mapping provided, return empty preview (just validating the file)
  if (!mapping || Object.keys(mapping).length === 0) {
    return preview;
  }

  // Check that title is mapped
  const titleColumn = Object.entries(mapping).find(
    ([, tandemField]) => tandemField === "title"
  );
  if (!titleColumn) {
    throw new Error("Column mapping must include a 'title' field.");
  }

  const projectNames = new Set<string>();
  const contextNames = new Set<string>();

  for (const row of rows) {
    const mapped: Record<string, string> = {};
    for (const [csvColumn, tandemField] of Object.entries(mapping)) {
      if (!tandemField) continue;
      mapped[tandemField] = row[csvColumn] ?? "";
    }

    const title = mapped.title?.trim();
    if (!title) continue;

    // Collect projects
    const projectTitle = mapped.projectTitle?.trim() || undefined;
    if (projectTitle && !projectNames.has(projectTitle.toLowerCase())) {
      projectNames.add(projectTitle.toLowerCase());
      preview.projects.push({
        title: projectTitle,
        status: "ACTIVE",
        type: "PARALLEL",
        isDuplicate: false,
        duplicateAction: "skip",
      });
    }

    // Collect contexts
    const contextName = mapped.contextName?.trim() || undefined;
    if (contextName && !contextNames.has(contextName.toLowerCase())) {
      contextNames.add(contextName.toLowerCase());
      preview.contexts.push({
        name: contextName.startsWith("@") ? contextName : `@${contextName}`,
        isDuplicate: false,
      });
    }

    // Parse energy level
    let energyLevel: string | undefined;
    if (mapped.energyLevel) {
      const el = mapped.energyLevel.toUpperCase().trim();
      if (["LOW", "MEDIUM", "HIGH"].includes(el)) {
        energyLevel = el;
      }
    }

    // Parse estimated minutes
    let estimatedMins: number | undefined;
    if (mapped.estimatedMins) {
      const mins = parseInt(mapped.estimatedMins, 10);
      if (!isNaN(mins) && mins > 0) estimatedMins = mins;
    }

    // Parse due date
    let dueDate: string | undefined;
    if (mapped.dueDate) {
      try {
        const d = new Date(mapped.dueDate);
        if (!isNaN(d.getTime())) dueDate = d.toISOString();
      } catch {
        // Skip invalid dates
      }
    }

    preview.tasks.push({
      title,
      notes: mapped.notes?.trim() || undefined,
      status: mapped.status?.toUpperCase().trim() || "NOT_STARTED",
      energyLevel,
      estimatedMins,
      dueDate,
      projectTitle,
      contextName: contextName
        ? contextName.startsWith("@")
          ? contextName
          : `@${contextName}`
        : undefined,
      isDuplicate: false,
      duplicateAction: "skip",
    });
  }

  return preview;
}

/**
 * Extract headers from a CSV string for the mapping UI.
 */
export function getCsvHeaders(content: string): string[] {
  const firstNewline = content.indexOf("\n");
  const headerLine =
    firstNewline > 0 ? content.slice(0, firstNewline).trim() : content.trim();

  // Simple header parse — split by comma, strip quotes
  return headerLine.split(",").map((h) => h.replace(/^"|"$/g, "").trim());
}
