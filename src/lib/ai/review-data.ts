import { prisma } from "@/lib/prisma";
import { getAIPermissions, aiVisibleWhere } from "@/lib/ai/visibility-filter";

/**
 * Review Summary Data Fetcher
 *
 * Builds a comprehensive snapshot of the user's GTD state for the
 * AI weekly review coach. Richer than buildGTDContext — includes
 * review-specific analytics (stale projects, streak, goals, etc.)
 *
 * All queries respect AI visibility settings.
 */

export interface ReviewSummaryData {
  inbox: {
    unprocessedCount: number;
    oldestItemAge: number | null;
    recentCaptures: number;
  };
  projects: {
    active: Array<{
      id: string;
      title: string;
      taskCount: number;
      completedTaskCount: number;
      hasNextAction: boolean;
      daysSinceActivity: number;
      nextActionTitle: string | null;
    }>;
    stale: Array<{
      id: string;
      title: string;
      daysSinceActivity: number;
    }>;
    withoutNextAction: Array<{
      id: string;
      title: string;
    }>;
    completedThisWeek: number;
  };
  tasks: {
    overdueCount: number;
    completedThisWeek: number;
    createdThisWeek: number;
    waitingForCount: number;
    waitingForOverdue: number;
  };
  goals: Array<{
    id: string;
    title: string;
    progress: number;
    status: string;
    targetDate: string | null;
    linkedProjectCount: number;
    hasActiveProject: boolean;
  }>;
  horizons: {
    hasNotes: boolean;
    daysSinceHorizonReview: number | null;
    isOverdue: boolean;
  };
  somedayMaybeCount: number;
  lastReviewDate: string | null;
  daysSinceLastReview: number | null;
  reviewStreak: number;
}

export async function getReviewSummaryData(
  userId: string
): Promise<ReviewSummaryData> {
  const perms = await getAIPermissions(userId);

  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // If AI is completely disabled, return empty data
  if (!perms.enabled) {
    return emptyReviewData();
  }

  const [
    unprocessedCount,
    oldestUnprocessed,
    recentCaptures,
    activeProjects,
    completedProjectsThisWeek,
    overdueTasks,
    completedTasksThisWeek,
    createdTasksThisWeek,
    waitingFors,
    goals,
    lastReview,
    reviewHistory,
    somedayCount,
    horizonNotes,
    lastHorizonReview,
  ] = await Promise.all([
    // 1. Unprocessed inbox count
    perms.canReadInbox
      ? prisma.inboxItem.count({
          where: {
            userId,
            status: "UNPROCESSED",
            ...aiVisibleWhere(),
          },
        })
      : 0,

    // 2. Oldest unprocessed inbox item
    perms.canReadInbox
      ? prisma.inboxItem.findFirst({
          where: {
            userId,
            status: "UNPROCESSED",
            ...aiVisibleWhere(),
          },
          orderBy: { createdAt: "asc" },
          select: { createdAt: true },
        })
      : null,

    // 3. Items captured in last 7 days
    perms.canReadInbox
      ? prisma.inboxItem.count({
          where: {
            userId,
            createdAt: { gte: sevenDaysAgo },
            ...aiVisibleWhere(),
          },
        })
      : 0,

    // 4. Active projects with tasks
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
              where: { status: { notIn: ["COMPLETED", "DROPPED"] } },
              select: {
                id: true,
                title: true,
                isNextAction: true,
                status: true,
                updatedAt: true,
              },
            },
          },
          orderBy: { updatedAt: "desc" },
        })
      : [],

    // 5. Projects completed this week
    perms.canReadProjects
      ? prisma.project.count({
          where: {
            userId,
            status: "COMPLETED",
            completedAt: { gte: sevenDaysAgo },
            ...aiVisibleWhere(),
          },
        })
      : 0,

    // 6. Overdue tasks
    perms.canReadTasks
      ? prisma.task.count({
          where: {
            userId,
            dueDate: { lt: now },
            status: { notIn: ["COMPLETED", "DROPPED"] },
            ...aiVisibleWhere(),
          },
        })
      : 0,

    // 7. Tasks completed this week
    perms.canReadTasks
      ? prisma.task.count({
          where: {
            userId,
            status: "COMPLETED",
            completedAt: { gte: sevenDaysAgo },
            ...aiVisibleWhere(),
          },
        })
      : 0,

    // 8. Tasks created this week
    perms.canReadTasks
      ? prisma.task.count({
          where: {
            userId,
            createdAt: { gte: sevenDaysAgo },
            ...aiVisibleWhere(),
          },
        })
      : 0,

    // 9. Unresolved waiting-for items
    prisma.waitingFor.findMany({
      where: { userId, isResolved: false },
      select: { id: true, dueDate: true },
    }),

    // 10. Active goals with project counts
    prisma.goal.findMany({
      where: {
        userId,
        status: { notIn: ["ACHIEVED", "DEFERRED"] },
      },
      include: {
        projects: {
          where: { status: "ACTIVE" },
          select: { id: true },
        },
      },
    }),

    // 11. Last completed weekly review
    prisma.weeklyReview.findFirst({
      where: { userId, status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
      select: { completedAt: true },
    }),

    // 12. Completed reviews for streak calculation
    prisma.weeklyReview.findMany({
      where: { userId, status: "COMPLETED" },
      orderBy: { weekOf: "desc" },
      select: { weekOf: true },
      take: 52,
    }),

    // 13. Someday/maybe project count
    perms.canReadProjects
      ? prisma.project.count({
          where: {
            userId,
            status: "SOMEDAY_MAYBE",
            ...aiVisibleWhere(),
          },
        })
      : 0,

    // 14. Horizon notes exist check
    prisma.horizonNote.findFirst({
      where: { userId },
      select: { id: true },
    }),

    // 15. Last completed horizon review
    prisma.horizonReview.findFirst({
      where: { userId, status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
      select: { completedAt: true },
    }),
  ]);

  // Compute oldest item age in days
  const oldestItemAge = oldestUnprocessed
    ? Math.floor(
        (now.getTime() - oldestUnprocessed.createdAt.getTime()) / 86400000
      )
    : null;

  // Compute project summaries with staleness
  const projectSummaries = activeProjects.map((p) => {
    const latestTaskUpdate = p.tasks.reduce(
      (max, t) => (t.updatedAt > max ? t.updatedAt : max),
      p.updatedAt
    );
    const daysSinceActivity = Math.floor(
      (now.getTime() - latestTaskUpdate.getTime()) / 86400000
    );
    const nextAction = p.tasks.find((t) => t.isNextAction);

    return {
      id: p.id,
      title: p.title,
      taskCount: p.tasks.length,
      completedTaskCount: 0,
      hasNextAction: !!nextAction,
      daysSinceActivity,
      nextActionTitle: nextAction?.title ?? null,
    };
  });

  // Stale projects (7+ days inactive), sorted by staleness
  const staleProjects = projectSummaries
    .filter((p) => p.daysSinceActivity >= 7)
    .sort((a, b) => b.daysSinceActivity - a.daysSinceActivity);

  // Projects without next actions
  const withoutNextAction = projectSummaries.filter((p) => !p.hasNextAction);

  // Waiting-for overdue count
  const waitingForOverdue = waitingFors.filter(
    (w) => w.dueDate && w.dueDate < now
  ).length;

  // Review streak — consecutive weeks with completed reviews
  let reviewStreak = 0;
  const mondayThisWeek = getMonday(now);
  for (let i = 0; i < reviewHistory.length; i++) {
    const expectedMonday = new Date(mondayThisWeek);
    expectedMonday.setDate(expectedMonday.getDate() - i * 7);
    const reviewMonday = getMonday(new Date(reviewHistory[i].weekOf));
    if (reviewMonday.getTime() === expectedMonday.getTime()) {
      reviewStreak++;
    } else {
      break;
    }
  }

  // Days since last review
  const daysSinceLastReview = lastReview?.completedAt
    ? Math.floor(
        (now.getTime() - lastReview.completedAt.getTime()) / 86400000
      )
    : null;

  // Horizon review info
  const daysSinceHorizonReview = lastHorizonReview?.completedAt
    ? Math.floor(
        (now.getTime() - lastHorizonReview.completedAt.getTime()) / 86400000
      )
    : null;

  // Format goals
  const goalSummaries = goals.map((g) => ({
    id: g.id,
    title: g.title,
    progress: g.progress,
    status: g.status,
    targetDate: g.targetDate?.toISOString() ?? null,
    linkedProjectCount: g.projects.length,
    hasActiveProject: g.projects.length > 0,
  }));

  // Cap active projects at 20 by staleness for prompt size control
  const cappedActive = [...projectSummaries]
    .sort((a, b) => b.daysSinceActivity - a.daysSinceActivity)
    .slice(0, 20);

  return {
    inbox: {
      unprocessedCount,
      oldestItemAge,
      recentCaptures,
    },
    projects: {
      active: cappedActive,
      stale: staleProjects.slice(0, 20),
      withoutNextAction,
      completedThisWeek: completedProjectsThisWeek,
    },
    tasks: {
      overdueCount: overdueTasks,
      completedThisWeek: completedTasksThisWeek,
      createdThisWeek: createdTasksThisWeek,
      waitingForCount: waitingFors.length,
      waitingForOverdue,
    },
    goals: goalSummaries,
    horizons: {
      hasNotes: !!horizonNotes,
      daysSinceHorizonReview,
      isOverdue:
        daysSinceHorizonReview === null || daysSinceHorizonReview > 90,
    },
    somedayMaybeCount: somedayCount,
    lastReviewDate: lastReview?.completedAt?.toISOString() ?? null,
    daysSinceLastReview,
    reviewStreak,
  };
}

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function emptyReviewData(): ReviewSummaryData {
  return {
    inbox: { unprocessedCount: 0, oldestItemAge: null, recentCaptures: 0 },
    projects: {
      active: [],
      stale: [],
      withoutNextAction: [],
      completedThisWeek: 0,
    },
    tasks: {
      overdueCount: 0,
      completedThisWeek: 0,
      createdThisWeek: 0,
      waitingForCount: 0,
      waitingForOverdue: 0,
    },
    goals: [],
    horizons: {
      hasNotes: false,
      daysSinceHorizonReview: null,
      isOverdue: true,
    },
    somedayMaybeCount: 0,
    lastReviewDate: null,
    daysSinceLastReview: null,
    reviewStreak: 0,
  };
}
