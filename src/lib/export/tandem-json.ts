import { prisma } from "@/lib/prisma";
import type {
  TandemExport,
  TaskExport,
  ProjectExport,
  InboxItemExport,
  ContextExport,
  AreaExport,
  GoalExport,
  HorizonNoteExport,
  WikiArticleExport,
  WaitingForExport,
  RecurringTemplateExport,
  WeeklyReviewExport,
} from "./types";

type Scope =
  | "all"
  | "tasks"
  | "projects"
  | "inbox"
  | "contexts"
  | "areas"
  | "goals"
  | "horizons"
  | "wiki";

const ACTIVE_TASK_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "WAITING"] as const;
const ACTIVE_PROJECT_STATUSES = ["ACTIVE", "ON_HOLD", "SOMEDAY_MAYBE"] as const;

function d(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

function shouldInclude(scope: Scope, entity: Scope): boolean {
  return scope === "all" || scope === entity;
}

// ---------------------------------------------------------------------------
// Per-entity fetchers
// ---------------------------------------------------------------------------

async function fetchTasks(
  userId: string,
  includeCompleted: boolean
): Promise<TaskExport[]> {
  const tasks = await prisma.task.findMany({
    where: {
      userId,
      ...(!includeCompleted && {
        status: { in: [...ACTIVE_TASK_STATUSES] },
      }),
    },
    include: {
      project: { select: { title: true } },
      context: { select: { name: true } },
    },
    orderBy: { sortOrder: "asc" },
  });

  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    notes: t.notes,
    status: t.status,
    isNextAction: t.isNextAction,
    estimatedMins: t.estimatedMins,
    energyLevel: t.energyLevel,
    scheduledDate: d(t.scheduledDate),
    dueDate: d(t.dueDate),
    sortOrder: t.sortOrder,
    completedAt: d(t.completedAt),
    createdAt: t.createdAt.toISOString(),
    projectTitle: t.project?.title ?? null,
    contextName: t.context?.name ?? null,
  }));
}

async function fetchProjects(
  userId: string,
  includeCompleted: boolean
): Promise<ProjectExport[]> {
  const projects = await prisma.project.findMany({
    where: {
      userId,
      teamId: null, // Personal projects only
      ...(!includeCompleted && {
        status: { in: [...ACTIVE_PROJECT_STATUSES] },
      }),
    },
    include: {
      area: { select: { name: true } },
      goal: { select: { title: true } },
      parentProject: { select: { title: true } },
    },
    orderBy: [{ depth: "asc" }, { sortOrder: "asc" }],
  });

  return projects.map((p) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    status: p.status,
    type: p.type,
    childType: p.childType,
    outcome: p.outcome,
    startDate: d(p.startDate),
    endDate: d(p.endDate),
    sortOrder: p.sortOrder,
    isSomedayMaybe: p.isSomedayMaybe,
    completedAt: d(p.completedAt),
    createdAt: p.createdAt.toISOString(),
    areaName: p.area?.name ?? null,
    goalTitle: p.goal?.title ?? null,
    parentProjectTitle: p.parentProject?.title ?? null,
  }));
}

async function fetchInboxItems(
  userId: string,
  includeCompleted: boolean
): Promise<InboxItemExport[]> {
  const items = await prisma.inboxItem.findMany({
    where: {
      userId,
      ...(!includeCompleted && { status: "UNPROCESSED" }),
    },
    orderBy: { createdAt: "desc" },
  });

  return items.map((i) => ({
    id: i.id,
    content: i.content,
    notes: i.notes,
    status: i.status,
    createdAt: i.createdAt.toISOString(),
  }));
}

async function fetchContexts(userId: string): Promise<ContextExport[]> {
  const contexts = await prisma.context.findMany({
    where: { userId },
    orderBy: { sortOrder: "asc" },
  });

  return contexts.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    icon: c.icon,
    sortOrder: c.sortOrder,
  }));
}

async function fetchAreas(userId: string): Promise<AreaExport[]> {
  const areas = await prisma.area.findMany({
    where: { userId },
    orderBy: { sortOrder: "asc" },
  });

  return areas.map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    isActive: a.isActive,
    sortOrder: a.sortOrder,
  }));
}

async function fetchGoals(
  userId: string,
  includeCompleted: boolean
): Promise<GoalExport[]> {
  const goals = await prisma.goal.findMany({
    where: {
      userId,
      ...(!includeCompleted && {
        status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
      }),
    },
    include: { area: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });

  return goals.map((g) => ({
    id: g.id,
    title: g.title,
    description: g.description,
    status: g.status,
    horizon: g.horizon,
    targetDate: d(g.targetDate),
    progress: g.progress,
    areaName: g.area?.name ?? null,
  }));
}

async function fetchHorizonNotes(
  userId: string
): Promise<HorizonNoteExport[]> {
  const notes = await prisma.horizonNote.findMany({
    where: { userId },
    orderBy: { level: "asc" },
  });

  return notes.map((n) => ({
    id: n.id,
    level: n.level,
    title: n.title,
    content: n.content,
  }));
}

async function fetchWikiArticles(
  userId: string
): Promise<WikiArticleExport[]> {
  const articles = await prisma.wikiArticle.findMany({
    where: { userId, teamId: null }, // Personal wiki only
    orderBy: { title: "asc" },
  });

  return articles.map((a) => ({
    id: a.id,
    title: a.title,
    slug: a.slug,
    content: a.content,
    tags: a.tags,
    createdAt: a.createdAt.toISOString(),
  }));
}

async function fetchWaitingFor(
  userId: string,
  includeCompleted: boolean
): Promise<WaitingForExport[]> {
  const items = await prisma.waitingFor.findMany({
    where: {
      userId,
      ...(!includeCompleted && { isResolved: false }),
    },
    orderBy: { createdAt: "desc" },
  });

  return items.map((w) => ({
    id: w.id,
    description: w.description,
    person: w.person,
    dueDate: d(w.dueDate),
    followUpDate: d(w.followUpDate),
    isResolved: w.isResolved,
    resolvedAt: d(w.resolvedAt),
    createdAt: w.createdAt.toISOString(),
  }));
}

async function fetchRecurringTemplates(
  userId: string
): Promise<RecurringTemplateExport[]> {
  // Simple routines (no windows) are exported as recurringTemplates for backward compat
  const routines = await prisma.routine.findMany({
    where: { userId, windows: { none: {} } },
    orderBy: { title: "asc" },
  });

  return routines.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    cronExpression: r.cronExpression,
    taskDefaults: r.taskDefaults,
    isActive: r.isActive,
    lastGenerated: d(r.lastGenerated),
    nextDue: d(r.nextDue),
  }));
}

async function fetchWeeklyReviews(
  userId: string,
  includeCompleted: boolean
): Promise<WeeklyReviewExport[]> {
  const reviews = await prisma.weeklyReview.findMany({
    where: {
      userId,
      ...(!includeCompleted && { status: "IN_PROGRESS" }),
    },
    orderBy: { weekOf: "desc" },
  });

  return reviews.map((r) => ({
    id: r.id,
    status: r.status,
    weekOf: r.weekOf.toISOString(),
    notes: r.notes,
    checklist: r.checklist,
    completedAt: d(r.completedAt),
    aiCoachUsed: r.aiCoachUsed,
    createdAt: r.createdAt.toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// Main export function
// ---------------------------------------------------------------------------

export async function exportTandemJson(
  userId: string,
  scope: string,
  includeCompleted: boolean
): Promise<TandemExport> {
  const s = scope as Scope;

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { name: true, email: true },
  });

  // Fetch all requested entity types in parallel
  const [
    tasks,
    projects,
    inboxItems,
    contexts,
    areas,
    goals,
    horizonNotes,
    wikiArticles,
    waitingFor,
    recurringTemplates,
    weeklyReviews,
  ] = await Promise.all([
    shouldInclude(s, "tasks") ? fetchTasks(userId, includeCompleted) : [],
    shouldInclude(s, "projects")
      ? fetchProjects(userId, includeCompleted)
      : [],
    shouldInclude(s, "inbox")
      ? fetchInboxItems(userId, includeCompleted)
      : [],
    shouldInclude(s, "contexts") ? fetchContexts(userId) : [],
    shouldInclude(s, "areas") ? fetchAreas(userId) : [],
    shouldInclude(s, "goals") ? fetchGoals(userId, includeCompleted) : [],
    shouldInclude(s, "horizons") ? fetchHorizonNotes(userId) : [],
    shouldInclude(s, "wiki") ? fetchWikiArticles(userId) : [],
    shouldInclude(s, "all") ? fetchWaitingFor(userId, includeCompleted) : [],
    shouldInclude(s, "all") ? fetchRecurringTemplates(userId) : [],
    shouldInclude(s, "all")
      ? fetchWeeklyReviews(userId, includeCompleted)
      : [],
  ]);

  const data = {
    tasks,
    projects,
    inboxItems,
    contexts,
    areas,
    goals,
    horizonNotes,
    wikiArticles,
    waitingFor,
    recurringTemplates,
    weeklyReviews,
  };

  const counts: Record<string, number> = {};
  for (const [key, value] of Object.entries(data)) {
    counts[key] = value.length;
  }

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    user: { name: user.name, email: user.email },
    data,
    counts,
  };
}
