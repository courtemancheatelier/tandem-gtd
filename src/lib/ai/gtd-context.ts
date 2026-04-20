import { prisma } from "@/lib/prisma";
import { getAIPermissions, aiVisibleWhere } from "@/lib/ai/visibility-filter";

/**
 * GTD Context Builder
 *
 * Builds a summary of the user's GTD state for AI system prompts.
 * Used by both the MCP server (as a resource) and the embedded
 * assistant (injected into the system prompt).
 *
 * All queries respect AI visibility settings.
 */

export interface GTDContext {
  inboxCount: number;
  activeProjectCount: number;
  availableTaskCount: number;
  daysSinceReview: number | null;
  contexts: string[];
  topProjects: Array<{
    title: string;
    taskCount: number;
    nextAction?: string;
  }>;
}

export async function buildGTDContext(userId: string): Promise<GTDContext> {
  const perms = await getAIPermissions(userId);

  if (!perms.enabled) {
    return {
      inboxCount: 0,
      activeProjectCount: 0,
      availableTaskCount: 0,
      daysSinceReview: null,
      contexts: [],
      topProjects: [],
    };
  }

  // Run all independent queries in parallel
  const [
    inboxCount,
    activeProjectCount,
    availableTaskCount,
    lastReview,
    contexts,
    topProjects,
  ] = await Promise.all([
    // Unprocessed inbox count
    perms.canReadInbox
      ? prisma.inboxItem.count({
          where: {
            userId,
            status: "UNPROCESSED",
            ...aiVisibleWhere(),
          },
        })
      : 0,

    // Active project count
    perms.canReadProjects
      ? prisma.project.count({
          where: {
            userId,
            status: "ACTIVE",
            ...aiVisibleWhere(),
          },
        })
      : 0,

    // Available next actions count
    perms.canReadTasks
      ? prisma.task.count({
          where: {
            userId,
            isNextAction: true,
            status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
            ...aiVisibleWhere(),
          },
        })
      : 0,

    // Last weekly review date
    prisma.weeklyReview.findFirst({
      where: {
        userId,
        status: "COMPLETED",
      },
      orderBy: { completedAt: "desc" },
      select: { completedAt: true },
    }),

    // Context names
    prisma.context.findMany({
      where: { userId },
      select: { name: true },
      orderBy: { sortOrder: "asc" },
    }),

    // Top 5 active projects with task counts and next action
    perms.canReadProjects
      ? prisma.project.findMany({
          where: {
            userId,
            status: "ACTIVE",
            ...aiVisibleWhere(),
          },
          select: {
            title: true,
            tasks: {
              where: {
                status: { in: ["NOT_STARTED", "IN_PROGRESS", "WAITING"] },
              },
              select: {
                id: true,
                title: true,
                isNextAction: true,
              },
            },
          },
          orderBy: { updatedAt: "desc" },
          take: 5,
        })
      : [],
  ]);

  // Compute days since last review
  let daysSinceReview: number | null = null;
  if (lastReview?.completedAt) {
    const now = new Date();
    const diffMs = now.getTime() - lastReview.completedAt.getTime();
    daysSinceReview = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  // Format top projects
  const formattedProjects = topProjects.map((p) => {
    const nextActionTask = p.tasks.find((t) => t.isNextAction);
    return {
      title: p.title,
      taskCount: p.tasks.length,
      nextAction: nextActionTask?.title,
    };
  });

  return {
    inboxCount,
    activeProjectCount,
    availableTaskCount,
    daysSinceReview,
    contexts: contexts.map((c) => c.name),
    topProjects: formattedProjects,
  };
}
