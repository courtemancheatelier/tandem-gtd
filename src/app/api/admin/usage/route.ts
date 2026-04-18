import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api/admin-helpers";

export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  // Fetch all users for the base list
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const userIds = users.map((u) => u.id);

  // Parallel aggregations
  const [
    tasksByUser,
    completedTasksByUser,
    droppedTasksByUser,
    projectsByUser,
    activeProjectsByUser,
    completedProjectsByUser,
    somedayProjectsByUser,
    inboxTotalByUser,
    inboxUnprocessedByUser,
    inboxProcessedSessions,
    waitingForByUser,
    waitingForUnresolvedByUser,
    reviewsByUser,
    contextsByUser,
    areasByUser,
    goalsByUser,
    horizonNotesByUser,
    lastActivity,
  ] = await Promise.all([
    // Tasks total
    prisma.task.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds } },
      _count: true,
    }),
    // Tasks completed
    prisma.task.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds }, status: "COMPLETED" },
      _count: true,
    }),
    // Tasks dropped
    prisma.task.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds }, status: "DROPPED" },
      _count: true,
    }),
    // Projects total
    prisma.project.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds } },
      _count: true,
    }),
    // Projects active
    prisma.project.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds }, status: "ACTIVE" },
      _count: true,
    }),
    // Projects completed
    prisma.project.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds }, status: "COMPLETED" },
      _count: true,
    }),
    // Projects someday/maybe
    prisma.project.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds }, status: "SOMEDAY_MAYBE" },
      _count: true,
    }),
    // Inbox total captured
    prisma.inboxItem.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds } },
      _count: true,
    }),
    // Inbox currently unprocessed
    prisma.inboxItem.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds }, status: "UNPROCESSED" },
      _count: true,
    }),
    // Inbox processing sessions: distinct dates with PROCESSED events per user
    prisma.$queryRaw<
      { actorId: string; sessions: bigint; lastProcessed: Date | null }[]
    >`
      SELECT "actorId",
             COUNT(DISTINCT DATE("createdAt")) as sessions,
             MAX("createdAt") as "lastProcessed"
      FROM "InboxEvent"
      WHERE "eventType" = 'PROCESSED'
        AND "actorId" IS NOT NULL
      GROUP BY "actorId"
    `,
    // WaitingFor total
    prisma.waitingFor.groupBy({
      by: ["userId"],
      _count: true,
    }),
    // WaitingFor unresolved
    prisma.waitingFor.groupBy({
      by: ["userId"],
      where: { isResolved: false },
      _count: true,
    }),
    // Weekly reviews completed
    prisma.weeklyReview.groupBy({
      by: ["userId"],
      where: { status: "COMPLETED" },
      _count: true,
    }),
    // Contexts per user
    prisma.context.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds } },
      _count: true,
    }),
    // Areas per user
    prisma.area.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds } },
      _count: true,
    }),
    // Goals per user
    prisma.goal.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds } },
      _count: true,
    }),
    // Horizon notes per user
    prisma.horizonNote.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds } },
      _count: true,
    }),
    // Last activity per user (most recent updatedAt across tasks and projects)
    prisma.$queryRaw<{ userId: string; lastActive: Date }[]>`
      SELECT u.id as "userId",
             GREATEST(
               (SELECT MAX("updatedAt") FROM "Task" WHERE "userId" = u.id),
               (SELECT MAX("updatedAt") FROM "Project" WHERE "userId" = u.id),
               (SELECT MAX("updatedAt") FROM "InboxItem" WHERE "userId" = u.id)
             ) as "lastActive"
      FROM "User" u
      WHERE u.id = ANY(${userIds})
    `,
  ]);

  // Last review date per user
  const lastReviews = await prisma.weeklyReview.findMany({
    where: { status: "COMPLETED" },
    orderBy: { completedAt: "desc" },
    distinct: ["userId"],
    select: { userId: true, completedAt: true },
  });

  // Build lookup maps
  function toMap(
    rows: { userId?: string | null; actorId?: string | null; _count: number | true }[],
    key: "userId" | "actorId" = "userId"
  ): Map<string, number> {
    const m = new Map<string, number>();
    for (const r of rows) {
      const id = r[key];
      if (id) m.set(id, typeof r._count === "number" ? r._count : 1);
    }
    return m;
  }

  const tasksMap = toMap(tasksByUser);
  const completedTasksMap = toMap(completedTasksByUser);
  const droppedTasksMap = toMap(droppedTasksByUser);
  const projectsMap = toMap(projectsByUser);
  const activeProjectsMap = toMap(activeProjectsByUser);
  const completedProjectsMap = toMap(completedProjectsByUser);
  const somedayProjectsMap = toMap(somedayProjectsByUser);
  const inboxTotalMap = toMap(inboxTotalByUser);
  const inboxUnprocessedMap = toMap(inboxUnprocessedByUser);
  const waitingForMap = toMap(waitingForByUser);
  const waitingForUnresolvedMap = toMap(waitingForUnresolvedByUser);
  const reviewsMap = toMap(reviewsByUser);
  const contextsMap = toMap(contextsByUser);
  const areasMap = toMap(areasByUser);
  const goalsMap = toMap(goalsByUser);
  const horizonNotesMap = toMap(horizonNotesByUser);

  const inboxSessionsMap = new Map<string, { sessions: number; lastProcessed: string | null }>();
  for (const r of inboxProcessedSessions) {
    if (r.actorId) {
      inboxSessionsMap.set(r.actorId, {
        sessions: Number(r.sessions),
        lastProcessed: r.lastProcessed?.toISOString() ?? null,
      });
    }
  }

  const lastActivityMap = new Map<string, string | null>();
  for (const r of lastActivity) {
    lastActivityMap.set(r.userId, r.lastActive?.toISOString() ?? null);
  }

  const lastReviewMap = new Map<string, string | null>();
  for (const r of lastReviews) {
    lastReviewMap.set(r.userId, r.completedAt?.toISOString() ?? null);
  }

  // Build per-user data
  const now = Date.now();
  const userMetrics = users.map((u) => {
    const totalTasks = tasksMap.get(u.id) ?? 0;
    const completedTasks = completedTasksMap.get(u.id) ?? 0;
    const droppedTasks = droppedTasksMap.get(u.id) ?? 0;
    const activeTasks = totalTasks - completedTasks - droppedTasks;

    const totalProjects = projectsMap.get(u.id) ?? 0;
    const activeProjects = activeProjectsMap.get(u.id) ?? 0;
    const completedProjects = completedProjectsMap.get(u.id) ?? 0;
    const somedayProjects = somedayProjectsMap.get(u.id) ?? 0;

    const inboxCaptured = inboxTotalMap.get(u.id) ?? 0;
    const inboxUnprocessed = inboxUnprocessedMap.get(u.id) ?? 0;
    const inboxProcessed = inboxCaptured - inboxUnprocessed;
    const inboxSessions = inboxSessionsMap.get(u.id);

    const waitingTotal = waitingForMap.get(u.id) ?? 0;
    const waitingUnresolved = waitingForUnresolvedMap.get(u.id) ?? 0;

    const reviewCount = reviewsMap.get(u.id) ?? 0;
    const lastReview = lastReviewMap.get(u.id) ?? null;

    const contexts = contextsMap.get(u.id) ?? 0;
    const areas = areasMap.get(u.id) ?? 0;
    const goals = goalsMap.get(u.id) ?? 0;
    const horizonNotes = horizonNotesMap.get(u.id) ?? 0;

    const lastActive = lastActivityMap.get(u.id) ?? null;
    const daysSinceActivity = lastActive
      ? Math.floor((now - new Date(lastActive).getTime()) / 86_400_000)
      : null;
    const daysSinceJoin = Math.floor(
      (now - new Date(u.createdAt).getTime()) / 86_400_000
    );

    let engagement: "new" | "active" | "drifting" | "dormant";
    if (daysSinceJoin <= 7) {
      engagement = "new";
    } else if (daysSinceActivity !== null && daysSinceActivity <= 7) {
      engagement = "active";
    } else if (daysSinceActivity !== null && daysSinceActivity <= 30) {
      engagement = "drifting";
    } else {
      engagement = "dormant";
    }

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      createdAt: u.createdAt.toISOString(),
      lastActive,
      engagement,
      tasks: {
        total: totalTasks,
        active: activeTasks,
        completed: completedTasks,
        dropped: droppedTasks,
      },
      projects: {
        total: totalProjects,
        active: activeProjects,
        completed: completedProjects,
        someday: somedayProjects,
      },
      inbox: {
        captured: inboxCaptured,
        processed: inboxProcessed,
        unprocessed: inboxUnprocessed,
        processingSessions: inboxSessions?.sessions ?? 0,
        lastProcessed: inboxSessions?.lastProcessed ?? null,
        processingRate:
          inboxCaptured > 0
            ? Math.round((inboxProcessed / inboxCaptured) * 100)
            : null,
      },
      waitingFor: {
        total: waitingTotal,
        unresolved: waitingUnresolved,
      },
      reviews: {
        completed: reviewCount,
        lastReview,
      },
      setup: {
        contexts,
        areas,
        goals,
        horizonNotes,
      },
    };
  });

  // Server-wide summary
  const summary = {
    totalUsers: users.length,
    totalTasks: userMetrics.reduce((s, u) => s + u.tasks.total, 0),
    totalCompleted: userMetrics.reduce((s, u) => s + u.tasks.completed, 0),
    totalProjects: userMetrics.reduce((s, u) => s + u.projects.total, 0),
    totalInboxProcessed: userMetrics.reduce((s, u) => s + u.inbox.processed, 0),
    totalReviews: userMetrics.reduce((s, u) => s + u.reviews.completed, 0),
    engagement: {
      active: userMetrics.filter((u) => u.engagement === "active").length,
      new: userMetrics.filter((u) => u.engagement === "new").length,
      drifting: userMetrics.filter((u) => u.engagement === "drifting").length,
      dormant: userMetrics.filter((u) => u.engagement === "dormant").length,
    },
  };

  return NextResponse.json({ summary, users: userMetrics });
}
