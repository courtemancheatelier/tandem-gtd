import type { TandemExport } from "@/lib/export/types";
import type { ImportPreview } from "../types";
import { emptyPreview } from "../types";

/**
 * Converts a Tandem export `data` object into an ImportPreview.
 * Shared by single-user import and server-wide import.
 */
export function parseTandemJsonData(
  exportData: TandemExport["data"]
): ImportPreview {
  const preview: ImportPreview = emptyPreview();

  // Tasks
  if (Array.isArray(exportData.tasks)) {
    preview.tasks = exportData.tasks.map((t) => ({
      title: t.title,
      notes: t.notes,
      status: t.status || "NOT_STARTED",
      isNextAction: t.isNextAction ?? false,
      estimatedMins: t.estimatedMins,
      energyLevel: t.energyLevel,
      scheduledDate: t.scheduledDate,
      dueDate: t.dueDate,
      sortOrder: t.sortOrder,
      completedAt: t.completedAt,
      projectTitle: t.projectTitle,
      contextName: t.contextName,
      isDuplicate: false,
      duplicateAction: "skip" as const,
    }));
  }

  // Projects
  if (Array.isArray(exportData.projects)) {
    preview.projects = exportData.projects.map((p) => ({
      title: p.title,
      description: p.description,
      status: p.status || "ACTIVE",
      type: p.type || "SEQUENTIAL",
      childType: p.childType,
      outcome: p.outcome,
      sortOrder: p.sortOrder,
      isSomedayMaybe: p.isSomedayMaybe ?? false,
      completedAt: p.completedAt,
      areaName: p.areaName,
      goalTitle: p.goalTitle,
      parentProjectTitle: p.parentProjectTitle,
      isDuplicate: false,
      duplicateAction: "skip" as const,
    }));
  }

  // Contexts
  if (Array.isArray(exportData.contexts)) {
    preview.contexts = exportData.contexts.map((c) => ({
      name: c.name,
      color: c.color,
      icon: c.icon,
      isDuplicate: false,
    }));
  }

  // Areas
  if (Array.isArray(exportData.areas)) {
    preview.areas = exportData.areas.map((a) => ({
      name: a.name,
      description: a.description,
      isActive: a.isActive ?? true,
      isDuplicate: false,
    }));
  }

  // Goals
  if (Array.isArray(exportData.goals)) {
    preview.goals = exportData.goals.map((g) => ({
      title: g.title,
      description: g.description,
      status: g.status || "NOT_STARTED",
      horizon: g.horizon,
      targetDate: g.targetDate,
      progress: g.progress ?? 0,
      areaName: g.areaName,
      isDuplicate: false,
    }));
  }

  // Inbox items
  if (Array.isArray(exportData.inboxItems)) {
    preview.inboxItems = exportData.inboxItems.map((i) => ({
      content: i.content,
      notes: i.notes,
      status: i.status || "UNPROCESSED",
    }));
  }

  // Horizon notes
  if (Array.isArray(exportData.horizonNotes)) {
    preview.horizonNotes = exportData.horizonNotes.map((n) => ({
      level: n.level,
      title: n.title,
      content: n.content,
    }));
  }

  // Wiki articles
  if (Array.isArray(exportData.wikiArticles)) {
    preview.wikiArticles = exportData.wikiArticles.map((a) => ({
      title: a.title,
      slug: a.slug,
      content: a.content,
      tags: a.tags ?? [],
      isDuplicate: false,
    }));
  }

  // Waiting for
  if (Array.isArray(exportData.waitingFor)) {
    preview.waitingFor = exportData.waitingFor.map((w) => ({
      description: w.description,
      person: w.person,
      dueDate: w.dueDate,
      followUpDate: w.followUpDate,
      isResolved: w.isResolved ?? false,
    }));
  }

  // Recurring templates
  if (Array.isArray(exportData.recurringTemplates)) {
    preview.recurringTemplates = exportData.recurringTemplates.map((r) => ({
      title: r.title,
      description: r.description,
      cronExpression: r.cronExpression,
      taskDefaults: r.taskDefaults,
      isActive: r.isActive ?? true,
    }));
  }

  // Weekly reviews
  if (Array.isArray(exportData.weeklyReviews)) {
    preview.weeklyReviews = exportData.weeklyReviews.map((r) => ({
      status: r.status,
      weekOf: r.weekOf,
      notes: r.notes,
      checklist: r.checklist,
      completedAt: r.completedAt,
      aiCoachUsed: r.aiCoachUsed ?? false,
    }));
  }

  return preview;
}

/**
 * Parses a Tandem JSON export file (string) into an ImportPreview.
 * Validates basic structure but does NOT check for duplicates — that
 * happens separately via detectDuplicates().
 */
export function parseTandemJson(content: string): ImportPreview {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Invalid JSON file");
  }

  const data = parsed as Record<string, unknown>;

  if (data.version !== 1) {
    throw new Error(
      `Unsupported export version: ${data.version ?? "unknown"}. Expected version 1.`
    );
  }

  if (!data.data || typeof data.data !== "object") {
    throw new Error("Invalid Tandem export: missing 'data' object");
  }

  return parseTandemJsonData((data as unknown as TandemExport).data);
}
