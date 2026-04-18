import { parseCsv } from "./csv-utils";
import type { ImportPreview } from "../types";
import { emptyPreview } from "../types";

/**
 * Todoist priority → Tandem energy level mapping.
 * Todoist: p1 = highest, p4 = lowest
 */
function mapPriority(priority: string): string | undefined {
  switch (priority) {
    case "1":
      return "HIGH";
    case "2":
      return "MEDIUM";
    case "3":
    case "4":
      return "LOW";
    default:
      return undefined;
  }
}

/**
 * Parse a Todoist date string into ISO 8601.
 * Todoist exports dates as "YYYY-MM-DD" or "YYYY-MM-DD HH:MM" or empty.
 */
function parseTodoistDate(dateStr: string): string | undefined {
  if (!dateStr?.trim()) return undefined;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return undefined;
    return d.toISOString();
  } catch {
    return undefined;
  }
}

/**
 * Parse a Todoist CSV export into an ImportPreview.
 *
 * Todoist CSV columns:
 * TYPE, CONTENT, DESCRIPTION, PRIORITY, INDENT, AUTHOR, RESPONSIBLE,
 * DATE, DATE_LANG, TIMEZONE, PROJECT (header section name)
 */
export function parseTodoistCsv(content: string): ImportPreview {
  const rows = parseCsv(content);
  if (rows.length === 0) {
    throw new Error("Empty CSV file or no data rows found.");
  }

  const preview = emptyPreview();
  const projectNames = new Set<string>();
  const contextNames = new Set<string>();

  for (const row of rows) {
    const type = (row.TYPE || row.type || "").toLowerCase();

    // Only import task rows
    if (type !== "task") continue;

    const rawContent = row.CONTENT || row.content || "";
    if (!rawContent.trim()) continue;

    const projectName = (row.PROJECT || row.project || "").trim();
    const labels = (row.LABELS || row.labels || "").trim();
    const priority = (row.PRIORITY || row.priority || "").trim();
    const date = (row.DATE || row.date || "").trim();
    const description = (row.DESCRIPTION || row.description || "").trim();

    // First label → context
    const contextName = labels ? labels.split(",")[0].trim() : undefined;
    if (contextName && !contextNames.has(contextName.toLowerCase())) {
      contextNames.add(contextName.toLowerCase());
      preview.contexts.push({
        name: contextName.startsWith("@") ? contextName : `@${contextName}`,
        isDuplicate: false,
      });
    }

    // Track projects
    if (projectName && !projectNames.has(projectName.toLowerCase())) {
      projectNames.add(projectName.toLowerCase());
      preview.projects.push({
        title: projectName,
        status: "ACTIVE",
        type: "PARALLEL", // Todoist projects are generally parallel
        isDuplicate: false,
        duplicateAction: "skip",
      });
    }

    preview.tasks.push({
      title: rawContent,
      notes: description || undefined,
      status: "NOT_STARTED",
      energyLevel: mapPriority(priority),
      dueDate: parseTodoistDate(date),
      projectTitle: projectName || undefined,
      contextName: contextName
        ? contextName.startsWith("@")
          ? contextName
          : `@${contextName}`
        : undefined,
      isDuplicate: false,
      duplicateAction: "skip",
    });
  }

  if (preview.tasks.length === 0) {
    throw new Error(
      "No tasks found in CSV. Ensure the file is a Todoist export with a TYPE column."
    );
  }

  return preview;
}
