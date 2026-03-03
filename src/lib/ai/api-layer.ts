import { prisma } from "@/lib/prisma";
import {
  getAIPermissions,
  aiVisibleWhere,
  type AIPermissions,
} from "@/lib/ai/visibility-filter";
import { writeInboxEvent, createdDiff } from "@/lib/history/event-writer";
import { computeNextAction } from "@/lib/cascade";
import type {
  InboxItem,
  Task,
  EnergyLevel,
  EventSource,
} from "@prisma/client";

// ============================================================================
// Error Helpers
// ============================================================================

class AIPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIPermissionError";
  }
}

async function requireAI(userId: string): Promise<AIPermissions> {
  const perms = await getAIPermissions(userId);
  if (!perms.enabled) {
    throw new AIPermissionError("AI features are disabled for this user");
  }
  return perms;
}

function mapEventSource(source: "MCP" | "AI_EMBED"): EventSource {
  return source === "MCP" ? "MCP" : "AI_EMBED";
}

// ============================================================================
// Inbox Operations
// ============================================================================

/**
 * Capture one or more items into the inbox.
 * Creates InboxItem records from plain text strings.
 */
export async function aiInboxCapture(
  userId: string,
  input: {
    items: string[];
    source: "MCP" | "AI_EMBED";
  }
): Promise<InboxItem[]> {
  const perms = await requireAI(userId);
  if (!perms.canModify) {
    throw new AIPermissionError("AI does not have modify permission");
  }

  const created: InboxItem[] = [];

  for (const text of input.items) {
    const trimmed = text.trim();
    if (!trimmed) continue;

    const item = await prisma.inboxItem.create({
      data: {
        content: trimmed,
        userId,
        status: "UNPROCESSED",
        aiVisibility: perms.defaultVisibility,
      },
    });

    // Record the capture event
    await writeInboxEvent(
      prisma,
      item.id,
      "CAPTURED",
      createdDiff({
        content: item.content,
        status: item.status,
      }),
      {
        actorType: "AI",
        actorId: userId,
        source: mapEventSource(input.source),
        message: `AI captured inbox item via ${input.source}`,
      }
    );

    created.push(item);
  }

  return created;
}

/**
 * Returns the next unprocessed inbox item and the total unprocessed count.
 */
export async function aiInboxNext(
  userId: string
): Promise<{
  item: InboxItem | null;
  totalUnprocessed: number;
} | null> {
  const perms = await requireAI(userId);
  if (!perms.canReadInbox) {
    throw new AIPermissionError("AI cannot access inbox");
  }

  const [item, totalUnprocessed] = await Promise.all([
    prisma.inboxItem.findFirst({
      where: {
        userId,
        status: "UNPROCESSED",
        ...aiVisibleWhere(),
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.inboxItem.count({
      where: {
        userId,
        status: "UNPROCESSED",
        ...aiVisibleWhere(),
      },
    }),
  ]);

  return { item, totalUnprocessed };
}

// ============================================================================
// Task Operations
// ============================================================================

/**
 * Resolves a context name (e.g. "@home") to a context ID for the user.
 * Returns null if context not found.
 */
async function resolveContextId(
  userId: string,
  contextName: string
): Promise<string | null> {
  // Normalize: add "@" prefix if not present
  const normalized = contextName.startsWith("@")
    ? contextName
    : `@${contextName}`;

  const context = await prisma.context.findFirst({
    where: {
      userId,
      name: { equals: normalized, mode: "insensitive" },
    },
    select: { id: true },
  });

  return context?.id ?? null;
}

/**
 * Create a task via AI. Resolves context names to IDs and computes
 * next action status based on project type.
 */
export async function aiTaskCreate(
  userId: string,
  input: {
    title: string;
    projectId?: string;
    contextName?: string;
    energyLevel?: "LOW" | "MEDIUM" | "HIGH";
    estimatedMins?: number;
    notes?: string;
    scheduledDate?: string;
    dueDate?: string;
    source: "MCP" | "AI_EMBED";
  }
): Promise<Task> {
  const perms = await requireAI(userId);
  if (!perms.canModify) {
    throw new AIPermissionError("AI does not have modify permission");
  }

  // Resolve context name to ID
  let contextId: string | undefined;
  if (input.contextName) {
    const resolved = await resolveContextId(userId, input.contextName);
    if (resolved) {
      contextId = resolved;
    }
    // If context not found, silently skip (don't fail the whole operation)
  }

  // Verify project belongs to user if provided
  let isNextAction = true;
  if (input.projectId) {
    const project = await prisma.project.findFirst({
      where: { id: input.projectId, userId },
    });
    if (!project) {
      throw new Error("Project not found or does not belong to user");
    }
    isNextAction = await computeNextAction({
      projectId: project.id,
      projectType: project.type,
      userId,
    });
  }

  const task = await prisma.task.create({
    data: {
      title: input.title,
      userId,
      projectId: input.projectId,
      contextId,
      energyLevel: input.energyLevel as EnergyLevel | undefined,
      estimatedMins: input.estimatedMins,
      notes: input.notes,
      scheduledDate: input.scheduledDate
        ? new Date(input.scheduledDate)
        : undefined,
      dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      isNextAction,
      aiVisibility: perms.defaultVisibility,
    },
    include: {
      project: { select: { id: true, title: true, type: true } },
      context: { select: { id: true, name: true } },
    },
  });

  return task;
}

/**
 * Search tasks with flexible filters. Respects AI visibility.
 */
export async function aiTaskSearch(
  userId: string,
  input: {
    query?: string;
    contextName?: string;
    projectId?: string;
    status?: "available" | "waiting" | "deferred" | "completed";
    energyLevel?: string;
    maxTime?: number;
    limit?: number;
  }
): Promise<Task[]> {
  const perms = await requireAI(userId);
  if (!perms.canReadTasks) {
    throw new AIPermissionError("AI cannot access tasks");
  }

  // Build where clause
  const where: Record<string, unknown> = {
    userId,
    ...aiVisibleWhere(),
  };

  // Text search on title
  if (input.query) {
    where.title = { contains: input.query, mode: "insensitive" };
  }

  // Resolve context name to filter
  if (input.contextName) {
    const contextId = await resolveContextId(userId, input.contextName);
    if (contextId) {
      where.contextId = contextId;
    }
  }

  if (input.projectId) {
    where.projectId = input.projectId;
  }

  // Map semantic status to DB status
  if (input.status) {
    switch (input.status) {
      case "available":
        where.isNextAction = true;
        where.status = { in: ["NOT_STARTED", "IN_PROGRESS"] };
        break;
      case "waiting":
        where.status = "WAITING";
        break;
      case "deferred":
        where.scheduledDate = { gt: new Date() };
        where.status = { in: ["NOT_STARTED"] };
        break;
      case "completed":
        where.status = "COMPLETED";
        break;
    }
  }

  if (input.energyLevel) {
    where.energyLevel = input.energyLevel.toUpperCase();
  }

  if (input.maxTime) {
    where.estimatedMins = { lte: input.maxTime };
  }

  const tasks = await prisma.task.findMany({
    where,
    include: {
      project: { select: { id: true, title: true } },
      context: { select: { id: true, name: true } },
    },
    orderBy: [{ isNextAction: "desc" }, { sortOrder: "asc" }],
    take: input.limit ?? 20,
  });

  return tasks;
}

/**
 * The core GTD question: "What should I do now?"
 * Returns available next actions filtered by context, energy, and time.
 * Generates a human-readable summary string.
 */
export async function aiWhatNow(
  userId: string,
  filters: {
    contexts?: string[];
    energyLevel?: string;
    availableTime?: number;
  }
): Promise<{
  tasks: Array<{
    id: string;
    title: string;
    context?: string;
    energy?: string;
    estimatedMins?: number;
    project?: string;
  }>;
  summary: string;
}> {
  const perms = await requireAI(userId);
  if (!perms.canReadTasks) {
    throw new AIPermissionError("AI cannot access tasks");
  }

  // Build where clause for available next actions
  const where: Record<string, unknown> = {
    userId,
    isNextAction: true,
    status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
    ...aiVisibleWhere(),
  };

  // Filter by contexts
  if (filters.contexts && filters.contexts.length > 0) {
    const contextIds: string[] = [];
    for (const name of filters.contexts) {
      const id = await resolveContextId(userId, name);
      if (id) contextIds.push(id);
    }
    if (contextIds.length > 0) {
      where.contextId = { in: contextIds };
    }
  }

  // Filter by energy level
  if (filters.energyLevel) {
    where.energyLevel = filters.energyLevel.toUpperCase();
  }

  // Filter by available time
  if (filters.availableTime) {
    where.OR = [
      { estimatedMins: { lte: filters.availableTime } },
      { estimatedMins: null }, // Include tasks with no estimate
    ];
  }

  const tasks = await prisma.task.findMany({
    where,
    include: {
      project: { select: { id: true, title: true } },
      context: { select: { id: true, name: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    take: 15,
  });

  // Format the response
  const formatted = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    context: t.context?.name,
    energy: t.energyLevel ?? undefined,
    estimatedMins: t.estimatedMins ?? undefined,
    project: t.project?.title,
  }));

  // Build human-readable summary
  const summary = buildWhatNowSummary(formatted, filters);

  return { tasks: formatted, summary };
}

function buildWhatNowSummary(
  tasks: Array<{
    id: string;
    title: string;
    context?: string;
    energy?: string;
    estimatedMins?: number;
    project?: string;
  }>,
  filters: {
    contexts?: string[];
    energyLevel?: string;
    availableTime?: number;
  }
): string {
  if (tasks.length === 0) {
    const filterParts: string[] = [];
    if (filters.contexts?.length) {
      filterParts.push(`in ${filters.contexts.join(", ")}`);
    }
    if (filters.energyLevel) {
      filterParts.push(`at ${filters.energyLevel} energy`);
    }
    if (filters.availableTime) {
      filterParts.push(`within ${filters.availableTime} minutes`);
    }
    const filterStr = filterParts.length > 0
      ? ` matching your filters (${filterParts.join(", ")})`
      : "";
    return `No available next actions${filterStr}. Your plate is clear, or you may need to process your inbox or review your projects.`;
  }

  const filterParts: string[] = [];
  if (filters.contexts?.length) {
    filterParts.push(filters.contexts.join(", "));
  }
  if (filters.energyLevel) {
    filterParts.push(`${filters.energyLevel} energy`);
  }
  if (filters.availableTime) {
    filterParts.push(`${filters.availableTime} min available`);
  }

  const filterStr = filterParts.length > 0
    ? ` (${filterParts.join(", ")})`
    : "";

  const lines = tasks.slice(0, 5).map((t) => {
    const parts = [t.title];
    if (t.context) parts.push(t.context);
    if (t.estimatedMins) parts.push(`~${t.estimatedMins}min`);
    if (t.project) parts.push(`[${t.project}]`);
    return `- ${parts.join(" | ")}`;
  });

  const moreCount = tasks.length > 5 ? tasks.length - 5 : 0;
  const moreLine = moreCount > 0 ? `\n...and ${moreCount} more.` : "";

  return `You have ${tasks.length} available next action${tasks.length === 1 ? "" : "s"}${filterStr}:\n${lines.join("\n")}${moreLine}`;
}

// ============================================================================
// Project Operations
// ============================================================================

/**
 * List projects with enriched data: task counts, next action, completion.
 */
export async function aiProjectList(
  userId: string,
  filters?: {
    status?: string;
    areaId?: string;
  }
): Promise<
  Array<{
    id: string;
    title: string;
    status: string;
    type: string;
    outcome?: string;
    taskCount: number;
    completedTaskCount: number;
    nextAction?: string;
  }>
> {
  const perms = await requireAI(userId);
  if (!perms.canReadProjects) {
    throw new AIPermissionError("AI cannot access projects");
  }

  const where: Record<string, unknown> = {
    userId,
    ...aiVisibleWhere(),
  };

  if (filters?.status) {
    // Map friendly names to DB status
    const statusMap: Record<string, string> = {
      active: "ACTIVE",
      on_hold: "ON_HOLD",
      completed: "COMPLETED",
      dropped: "DROPPED",
      someday: "SOMEDAY_MAYBE",
    };
    const mapped = statusMap[filters.status.toLowerCase()];
    if (mapped) {
      where.status = mapped;
    } else {
      where.status = filters.status.toUpperCase();
    }
  }

  if (filters?.areaId) {
    where.areaId = filters.areaId;
  }

  const projects = await prisma.project.findMany({
    where,
    select: {
      id: true,
      title: true,
      status: true,
      type: true,
      outcome: true,
      tasks: {
        select: {
          id: true,
          title: true,
          status: true,
          isNextAction: true,
        },
      },
    },
    orderBy: [{ status: "asc" }, { sortOrder: "asc" }],
  });

  return projects.map((p) => {
    const totalTasks = p.tasks.length;
    const completedTasks = p.tasks.filter(
      (t) => t.status === "COMPLETED" || t.status === "DROPPED"
    ).length;
    const nextActionTask = p.tasks.find(
      (t) =>
        t.isNextAction &&
        (t.status === "NOT_STARTED" || t.status === "IN_PROGRESS")
    );

    return {
      id: p.id,
      title: p.title,
      status: p.status,
      type: p.type,
      outcome: p.outcome ?? undefined,
      taskCount: totalTasks,
      completedTaskCount: completedTasks,
      nextAction: nextActionTask?.title,
    };
  });
}

// ============================================================================
// Context & Area Operations
// ============================================================================

/**
 * List all contexts with task counts.
 */
export async function aiContextList(
  userId: string
): Promise<
  Array<{
    id: string;
    name: string;
    taskCount: number;
  }>
> {
  const perms = await requireAI(userId);
  if (!perms.canReadTasks) {
    throw new AIPermissionError("AI cannot access tasks/contexts");
  }

  const contexts = await prisma.context.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      tasks: {
        where: {
          status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
          isNextAction: true,
        },
        select: { id: true },
      },
    },
    orderBy: { sortOrder: "asc" },
  });

  return contexts.map((c) => ({
    id: c.id,
    name: c.name,
    taskCount: c.tasks.length,
  }));
}

/**
 * List all areas with active project counts.
 */
export async function aiAreaList(
  userId: string
): Promise<
  Array<{
    id: string;
    name: string;
    activeProjectCount: number;
  }>
> {
  const perms = await requireAI(userId);
  if (!perms.canReadProjects) {
    throw new AIPermissionError("AI cannot access projects/areas");
  }

  const areas = await prisma.area.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      projects: {
        where: { status: "ACTIVE" },
        select: { id: true },
      },
    },
    orderBy: { sortOrder: "asc" },
  });

  return areas.map((a) => ({
    id: a.id,
    name: a.name,
    activeProjectCount: a.projects.length,
  }));
}

// ============================================================================
// Weekly Review Operations
// ============================================================================

/**
 * Get the weekly review status.
 */
export async function aiReviewStatus(
  userId: string
): Promise<{
  lastReviewDate: string | null;
  daysSinceReview: number | null;
  isOverdue: boolean;
}> {
  await requireAI(userId);

  const lastReview = await prisma.weeklyReview.findFirst({
    where: {
      userId,
      status: "COMPLETED",
    },
    orderBy: { completedAt: "desc" },
    select: { completedAt: true },
  });

  if (!lastReview?.completedAt) {
    return {
      lastReviewDate: null,
      daysSinceReview: null,
      isOverdue: true,
    };
  }

  const now = new Date();
  const diffMs = now.getTime() - lastReview.completedAt.getTime();
  const daysSinceReview = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  return {
    lastReviewDate: lastReview.completedAt.toISOString(),
    daysSinceReview,
    isOverdue: daysSinceReview > 7,
  };
}

/**
 * Weekly Review Phase 1: Get Clear
 *
 * Returns unprocessed inbox count, orphaned actions (tasks with no project),
 * and stale items (tasks not updated in 14+ days).
 */
export async function aiReviewGetClear(
  userId: string
): Promise<{
  unprocessedInbox: number;
  orphanedActions: Array<{
    id: string;
    title: string;
    createdAt: string;
  }>;
  staleItems: Array<{
    id: string;
    title: string;
    updatedAt: string;
  }>;
}> {
  const perms = await requireAI(userId);

  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const [unprocessedInbox, orphanedActions, staleItems] = await Promise.all([
    // Count unprocessed inbox items
    perms.canReadInbox
      ? prisma.inboxItem.count({
          where: {
            userId,
            status: "UNPROCESSED",
            ...aiVisibleWhere(),
          },
        })
      : 0,

    // Tasks with no project that are still active
    perms.canReadTasks
      ? prisma.task.findMany({
          where: {
            userId,
            projectId: null,
            status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
            ...aiVisibleWhere(),
          },
          select: { id: true, title: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        })
      : [],

    // Tasks not updated in 14+ days
    perms.canReadTasks
      ? prisma.task.findMany({
          where: {
            userId,
            status: { in: ["NOT_STARTED", "IN_PROGRESS", "WAITING"] },
            updatedAt: { lt: fourteenDaysAgo },
            ...aiVisibleWhere(),
          },
          select: { id: true, title: true, updatedAt: true },
          orderBy: { updatedAt: "asc" },
        })
      : [],
  ]);

  return {
    unprocessedInbox,
    orphanedActions: orphanedActions.map((t) => ({
      id: t.id,
      title: t.title,
      createdAt: t.createdAt.toISOString(),
    })),
    staleItems: staleItems.map((t) => ({
      id: t.id,
      title: t.title,
      updatedAt: t.updatedAt.toISOString(),
    })),
  };
}

/**
 * Weekly Review Phase 2: Get Current
 *
 * Reviews active projects, waiting-for items, and upcoming deadlines.
 */
export async function aiReviewGetCurrent(
  userId: string
): Promise<{
  activeProjects: Array<{
    id: string;
    title: string;
    hasNextAction: boolean;
    daysSinceUpdate: number;
    status: "on_track" | "stale" | "stuck";
  }>;
  waitingFor: Array<{
    id: string;
    description: string;
    person: string;
    daysSinceCreated: number;
  }>;
  upcomingDeadlines: Array<{
    id: string;
    title: string;
    dueDate: string;
    daysUntilDue: number;
  }>;
}> {
  const perms = await requireAI(userId);

  const now = new Date();
  const fourteenDaysFromNow = new Date();
  fourteenDaysFromNow.setDate(fourteenDaysFromNow.getDate() + 14);

  const [projects, waitingFor, upcomingDeadlines] = await Promise.all([
    // Active projects with task info
    perms.canReadProjects
      ? prisma.project.findMany({
          where: {
            userId,
            status: "ACTIVE",
            ...aiVisibleWhere(),
          },
          select: {
            id: true,
            title: true,
            updatedAt: true,
            tasks: {
              where: {
                status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
              },
              select: {
                isNextAction: true,
              },
            },
          },
          orderBy: { updatedAt: "desc" },
        })
      : [],

    // Unresolved waiting-for items
    prisma.waitingFor.findMany({
      where: {
        userId,
        isResolved: false,
      },
      select: {
        id: true,
        description: true,
        person: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),

    // Tasks with due dates in the next 14 days
    perms.canReadTasks
      ? prisma.task.findMany({
          where: {
            userId,
            dueDate: {
              gte: now,
              lte: fourteenDaysFromNow,
            },
            status: { in: ["NOT_STARTED", "IN_PROGRESS", "WAITING"] },
            ...aiVisibleWhere(),
          },
          select: {
            id: true,
            title: true,
            dueDate: true,
          },
          orderBy: { dueDate: "asc" },
        })
      : [],
  ]);

  // Determine project status
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const formattedProjects = projects.map((p) => {
    const hasNextAction = p.tasks.some((t) => t.isNextAction);
    const diffMs = now.getTime() - p.updatedAt.getTime();
    const daysSinceUpdate = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    let status: "on_track" | "stale" | "stuck";
    if (!hasNextAction) {
      status = "stuck";
    } else if (daysSinceUpdate > 7) {
      status = "stale";
    } else {
      status = "on_track";
    }

    return {
      id: p.id,
      title: p.title,
      hasNextAction,
      daysSinceUpdate,
      status,
    };
  });

  const formattedWaitingFor = waitingFor.map((w) => {
    const diffMs = now.getTime() - w.createdAt.getTime();
    const daysSinceCreated = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return {
      id: w.id,
      description: w.description,
      person: w.person,
      daysSinceCreated,
    };
  });

  const formattedDeadlines = upcomingDeadlines
    .filter((t) => t.dueDate !== null)
    .map((t) => {
      const diffMs = t.dueDate!.getTime() - now.getTime();
      const daysUntilDue = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      return {
        id: t.id,
        title: t.title,
        dueDate: t.dueDate!.toISOString(),
        daysUntilDue,
      };
    });

  return {
    activeProjects: formattedProjects,
    waitingFor: formattedWaitingFor,
    upcomingDeadlines: formattedDeadlines,
  };
}

/**
 * Weekly Review Phase 3: Get Creative
 *
 * Surfaces neglected areas (areas with no active projects).
 */
export async function aiReviewGetCreative(
  userId: string
): Promise<{
  neglectedAreas: Array<{ id: string; name: string }>;
}> {
  const perms = await requireAI(userId);
  if (!perms.canReadProjects) {
    throw new AIPermissionError("AI cannot access projects/areas");
  }

  const areas = await prisma.area.findMany({
    where: {
      userId,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      projects: {
        where: { status: "ACTIVE" },
        select: { id: true },
      },
    },
  });

  const neglectedAreas = areas
    .filter((a) => a.projects.length === 0)
    .map((a) => ({ id: a.id, name: a.name }));

  return { neglectedAreas };
}

// Re-export the error class for route handlers to catch
export { AIPermissionError };
