import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api/auth-helpers";

const VALID_VELOCITY_WEEKS = [4, 12, 26];

export async function GET(req: NextRequest) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const velocityWeeksParam = parseInt(
    req.nextUrl.searchParams.get("velocityWeeks") ?? "12",
    10
  );
  const velocityWeeks = VALID_VELOCITY_WEEKS.includes(velocityWeeksParam)
    ? velocityWeeksParam
    : 12;

  const now = new Date();
  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const fourteenDaysAgo = new Date(now);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const thirtyDaysFromNow = new Date(now);
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  const eightWeeksAgo = new Date(now);
  eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);

  // Fetch core data in parallel
  const [
    rootProjects, allTasks, blockedTasksRaw, milestonesRaw,
    inboxCount, lastReview, cascadeEvents, areas, orphanGoals, disconnectedProjectCount,
  ] =
    await Promise.all([
      // Root-level active projects with children
      prisma.project.findMany({
        where: {
          userId,
          status: "ACTIVE",
          depth: 0,
        },
        include: {
          childProjects: {
            where: { status: "ACTIVE" },
            select: {
              id: true,
              title: true,
              rollupProgress: true,
            },
          },
        },
        orderBy: { sortOrder: "asc" },
      }),

      // All tasks for active projects (for health, progress, burn-down, velocity)
      prisma.task.findMany({
        where: {
          userId,
          project: { status: "ACTIVE" },
        },
        select: {
          id: true,
          title: true,
          status: true,
          isNextAction: true,
          estimatedMins: true,
          dueDate: true,
          completedAt: true,
          updatedAt: true,
          projectId: true,
          project: { select: { id: true, title: true, path: true } },
          predecessors: {
            include: {
              predecessor: {
                select: { id: true, title: true, status: true },
              },
            },
          },
        },
      }),

      // Blocked tasks: tasks with at least one non-completed/non-dropped predecessor
      prisma.task.findMany({
        where: {
          userId,
          status: { notIn: ["COMPLETED", "DROPPED"] },
          predecessors: {
            some: {
              predecessor: {
                status: { notIn: ["COMPLETED", "DROPPED"] },
              },
            },
          },
        },
        select: {
          id: true,
          title: true,
          projectId: true,
          project: { select: { id: true, title: true } },
          predecessors: {
            include: {
              predecessor: {
                select: { id: true, title: true, status: true },
              },
            },
          },
        },
        take: 50,
      }),

      // Upcoming milestones in next 30 days
      prisma.task.findMany({
        where: {
          userId,
          isMilestone: true,
          status: { notIn: ["COMPLETED", "DROPPED"] },
          dueDate: {
            gte: now,
            lte: thirtyDaysFromNow,
          },
        },
        select: {
          id: true,
          title: true,
          dueDate: true,
          status: true,
          projectId: true,
          project: { select: { id: true, title: true } },
        },
        orderBy: { dueDate: "asc" },
        take: 20,
      }),

      // GTD Health: Inbox count
      prisma.inboxItem.count({
        where: { userId, status: "UNPROCESSED" },
      }),

      // GTD Health: Last completed weekly review
      prisma.weeklyReview.findFirst({
        where: { userId, status: "COMPLETED" },
        orderBy: { completedAt: "desc" },
        select: { completedAt: true },
      }),

      // GTD Health: Cascade events (last 8 weeks for sparkline)
      prisma.taskEvent.findMany({
        where: {
          task: { userId },
          source: "CASCADE",
          createdAt: { gte: eightWeeksAgo },
        },
        select: { createdAt: true },
      }),

      // Horizon Alignment: Areas with project/goal counts
      prisma.area.findMany({
        where: { userId, isActive: true },
        select: {
          id: true,
          name: true,
          projects: {
            where: { status: "ACTIVE" },
            select: { id: true },
          },
          goals: {
            where: { status: { in: ["NOT_STARTED", "IN_PROGRESS"] } },
            select: { id: true },
          },
        },
        orderBy: { sortOrder: "asc" },
      }),

      // Horizon Alignment: Orphan goals (active goals with no active projects)
      prisma.goal.findMany({
        where: {
          userId,
          status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
          projects: { none: { status: "ACTIVE" } },
        },
        select: { id: true, title: true },
      }),

      // Horizon Alignment: Disconnected projects (active root projects with no area)
      prisma.project.count({
        where: { userId, status: "ACTIVE", depth: 0, areaId: null },
      }),
    ]);

  // Collect all project IDs in active project trees (root + children)
  const projectIdSet = new Set<string>();
  for (const rp of rootProjects) {
    projectIdSet.add(rp.id);
    for (const child of rp.childProjects) {
      projectIdSet.add(child.id);
    }
  }

  // Group tasks by root project (using path to determine root)
  const tasksByRootProject = new Map<
    string,
    typeof allTasks
  >();
  for (const task of allTasks) {
    if (!task.projectId) continue;
    // Find root project: check if task's project path starts with a root project id
    let rootId = task.projectId;
    if (task.project?.path) {
      const pathParts = task.project.path.split("/").filter(Boolean);
      if (pathParts.length > 0) {
        rootId = pathParts[0];
      }
    }
    // Fallback: if projectId itself is a root project
    if (!tasksByRootProject.has(rootId)) {
      tasksByRootProject.set(rootId, []);
    }
    tasksByRootProject.get(rootId)!.push(task);
  }

  // === Project Health ===
  const projectHealth = rootProjects.map((project) => {
    const tasks = tasksByRootProject.get(project.id) || [];
    const totalTasks = tasks.length;
    const activeTasks = tasks.filter(
      (t) => t.status !== "COMPLETED" && t.status !== "DROPPED"
    );

    const overdueCount = activeTasks.filter(
      (t) => t.dueDate && new Date(t.dueDate) < now
    ).length;

    const blockedCount = activeTasks.filter((t) =>
      t.predecessors.some(
        (p) =>
          p.predecessor.status !== "COMPLETED" &&
          p.predecessor.status !== "DROPPED"
      )
    ).length;

    const staleNextActions = activeTasks.filter(
      (t) =>
        t.isNextAction &&
        new Date(t.updatedAt) < fourteenDaysAgo
    ).length;

    const overduePercent = activeTasks.length > 0 ? overdueCount / activeTasks.length : 0;
    const blockedPercent = activeTasks.length > 0 ? blockedCount / activeTasks.length : 0;

    let status: "GREEN" | "YELLOW" | "RED" = "GREEN";
    if (overduePercent > 0.3 || blockedPercent > 0.5) {
      status = "RED";
    } else if (overduePercent > 0.1 || staleNextActions > 3) {
      status = "YELLOW";
    }

    return {
      id: project.id,
      title: project.title,
      status,
      rollupProgress: project.rollupProgress ?? 0,
      overdueCount,
      blockedCount,
      totalTasks,
      staleNextActions,
    };
  });

  // === Project Progress ===
  const projectProgress = rootProjects.map((project) => {
    const tasks = tasksByRootProject.get(project.id) || [];
    const tasksDone = tasks.filter((t) => t.status === "COMPLETED").length;

    return {
      id: project.id,
      title: project.title,
      rollupProgress: project.rollupProgress ?? 0,
      tasksDone,
      tasksTotal: tasks.length,
      children: project.childProjects.map((child) => {
        const childTasks = allTasks.filter((t) => t.projectId === child.id);
        return {
          id: child.id,
          title: child.title,
          rollupProgress: child.rollupProgress ?? 0,
          tasksDone: childTasks.filter((t) => t.status === "COMPLETED").length,
          tasksTotal: childTasks.length,
        };
      }),
    };
  });

  // === Burn-Down (last 90 days) ===
  const activeTasks = allTasks.filter(
    (t) => t.status !== "DROPPED"
  );
  const totalEstimateMins = activeTasks.reduce(
    (sum, t) => sum + (t.estimatedMins || 0),
    0
  );

  // Get completed tasks in the window, sorted by completedAt
  const completedInWindow = activeTasks
    .filter((t) => t.status === "COMPLETED" && t.completedAt && t.completedAt >= ninetyDaysAgo)
    .sort(
      (a, b) =>
        new Date(a.completedAt!).getTime() - new Date(b.completedAt!).getTime()
    );

  // Build daily burn-down data
  const burnDownData: { date: string; remaining: number; ideal: number }[] = [];
  const totalDays = 90;
  let cumulativeCompleted = 0;
  let completedIdx = 0;

  // Calculate already completed before the window
  const completedBeforeWindow = activeTasks.filter(
    (t) => t.status === "COMPLETED" && t.completedAt && t.completedAt < ninetyDaysAgo
  );
  const completedBeforeWindowMins = completedBeforeWindow.reduce(
    (sum, t) => sum + (t.estimatedMins || 0),
    0
  );
  cumulativeCompleted = completedBeforeWindowMins;

  for (let dayOffset = 0; dayOffset <= totalDays; dayOffset += 7) {
    const date = new Date(ninetyDaysAgo);
    date.setDate(date.getDate() + dayOffset);
    const dateStr = date.toISOString().slice(0, 10);

    // Add completed tasks up to this date
    while (
      completedIdx < completedInWindow.length &&
      new Date(completedInWindow[completedIdx].completedAt!) <= date
    ) {
      cumulativeCompleted +=
        completedInWindow[completedIdx].estimatedMins || 0;
      completedIdx++;
    }

    const remaining = Math.max(0, totalEstimateMins - cumulativeCompleted);
    const idealRemaining =
      totalEstimateMins * (1 - dayOffset / totalDays);

    burnDownData.push({
      date: dateStr,
      remaining: Math.round(remaining / 60), // Convert to hours
      ideal: Math.round(idealRemaining / 60),
    });
  }

  // === Velocity (configurable lookback) ===
  const velocityLookbackMs = velocityWeeks * 7 * 24 * 60 * 60 * 1000;
  const velocityWindowStart = new Date(now.getTime() - velocityLookbackMs);

  const completedRecently = allTasks.filter(
    (t) =>
      t.status === "COMPLETED" &&
      t.completedAt &&
      t.completedAt >= velocityWindowStart
  );

  // Group by ISO week (Monday start)
  const weekMap = new Map<
    string,
    { completedCount: number; completedMins: number }
  >();

  for (const task of completedRecently) {
    const completedDate = new Date(task.completedAt!);
    // Get Monday of that week
    const day = completedDate.getDay();
    const monday = new Date(completedDate);
    monday.setDate(monday.getDate() - ((day + 6) % 7));
    const weekKey = monday.toISOString().slice(0, 10);

    if (!weekMap.has(weekKey)) {
      weekMap.set(weekKey, { completedCount: 0, completedMins: 0 });
    }
    const entry = weekMap.get(weekKey)!;
    entry.completedCount++;
    entry.completedMins += task.estimatedMins || 0;
  }

  const velocityData = Array.from(weekMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, data]) => ({
      week,
      completedCount: data.completedCount,
      completedMins: data.completedMins,
    }));

  const numVelocityWeeks = velocityData.length || 1;

  const averagePerWeek =
    velocityData.length > 0
      ? Math.round(
          velocityData.reduce((sum, v) => sum + v.completedCount, 0) /
            numVelocityWeeks
        )
      : 0;

  const averageMinsPerWeek =
    velocityData.length > 0
      ? Math.round(
          velocityData.reduce((sum, v) => sum + v.completedMins, 0) /
            numVelocityWeeks
        )
      : 0;

  // Trend: last-4-week avg vs previous-4-week avg (need >= 8 weeks of data)
  let velocityTrend: { direction: "up" | "down"; percent: number } | null =
    null;
  if (velocityData.length >= 8) {
    const recentWeeks = velocityData.slice(-4);
    const previousWeeks = velocityData.slice(-8, -4);
    const recentAvg =
      recentWeeks.reduce((s, w) => s + w.completedCount, 0) /
      recentWeeks.length;
    const previousAvg =
      previousWeeks.reduce((s, w) => s + w.completedCount, 0) /
      previousWeeks.length;
    if (previousAvg > 0) {
      const changePct = ((recentAvg - previousAvg) / previousAvg) * 100;
      if (Math.abs(changePct) >= 5) {
        velocityTrend = {
          direction: changePct > 0 ? "up" : "down",
          percent: Math.round(Math.abs(changePct)),
        };
      }
    }
  }

  // === Blocked Tasks ===
  const blockedTasks = blockedTasksRaw.map((task) => ({
    id: task.id,
    title: task.title,
    projectId: task.projectId,
    projectTitle: task.project?.title ?? null,
    blockedBy: task.predecessors
      .filter(
        (p) =>
          p.predecessor.status !== "COMPLETED" &&
          p.predecessor.status !== "DROPPED"
      )
      .map((p) => ({
        id: p.predecessor.id,
        title: p.predecessor.title,
        status: p.predecessor.status,
      })),
  }));

  // === Stale Projects ===
  // Find active root projects where most recent task update is > 14 days ago
  const staleProjects: {
    id: string;
    title: string;
    status: string;
    daysSinceActivity: number;
    lastActivityDate: string;
  }[] = [];

  for (const project of rootProjects) {
    const tasks = tasksByRootProject.get(project.id) || [];
    if (tasks.length === 0) {
      // No tasks = use project updatedAt
      const daysSince = Math.floor(
        (now.getTime() - project.updatedAt.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysSince >= 14) {
        staleProjects.push({
          id: project.id,
          title: project.title,
          status: project.status,
          daysSinceActivity: daysSince,
          lastActivityDate: project.updatedAt.toISOString().slice(0, 10),
        });
      }
      continue;
    }

    const maxUpdated = tasks.reduce(
      (max, t) => (t.updatedAt > max ? t.updatedAt : max),
      tasks[0].updatedAt
    );

    const daysSince = Math.floor(
      (now.getTime() - maxUpdated.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSince >= 14) {
      staleProjects.push({
        id: project.id,
        title: project.title,
        status: project.status,
        daysSinceActivity: daysSince,
        lastActivityDate: maxUpdated.toISOString().slice(0, 10),
      });
    }
  }

  staleProjects.sort((a, b) => b.daysSinceActivity - a.daysSinceActivity);

  // === Stuck Projects (non-SINGLE_ACTIONS with no active next actions) ===
  const stuckProjects: { id: string; title: string; totalTasks: number }[] = [];
  for (const project of rootProjects) {
    if (project.type === "SINGLE_ACTIONS") continue;
    const tasks = tasksByRootProject.get(project.id) || [];
    const hasActiveNextAction = tasks.some(
      (t) =>
        t.isNextAction &&
        t.status !== "COMPLETED" &&
        t.status !== "DROPPED"
    );
    if (!hasActiveNextAction) {
      stuckProjects.push({
        id: project.id,
        title: project.title,
        totalTasks: tasks.length,
      });
    }
  }

  // === Cascade Sparkline (bucket by ISO week, Monday start) ===
  const cascadeWeekMap = new Map<string, number>();
  for (const event of cascadeEvents) {
    const d = new Date(event.createdAt);
    const day = d.getDay();
    const monday = new Date(d);
    monday.setDate(monday.getDate() - ((day + 6) % 7));
    const weekKey = monday.toISOString().slice(0, 10);
    cascadeWeekMap.set(weekKey, (cascadeWeekMap.get(weekKey) || 0) + 1);
  }
  const cascadeSparkline = Array.from(cascadeWeekMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, count]) => ({ week, count }));

  const cascadeThisWeek = cascadeSparkline.length > 0
    ? cascadeSparkline[cascadeSparkline.length - 1].count
    : 0;
  const cascadeLastWeek = cascadeSparkline.length > 1
    ? cascadeSparkline[cascadeSparkline.length - 2].count
    : 0;

  // === Review Days Since ===
  const daysSinceReview = lastReview?.completedAt
    ? Math.floor(
        (now.getTime() - new Date(lastReview.completedAt).getTime()) /
          (1000 * 60 * 60 * 24)
      )
    : null;

  // === Upcoming Milestones ===
  const upcomingMilestones = milestonesRaw.map((m) => {
    const dueDate = m.dueDate!;
    const daysUntilDue = Math.ceil(
      (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    return {
      id: m.id,
      title: m.title,
      dueDate: dueDate.toISOString().slice(0, 10),
      projectId: m.projectId,
      projectTitle: m.project?.title ?? null,
      status: m.status,
      daysUntilDue,
    };
  });

  return NextResponse.json({
    projectHealth,
    projectProgress,
    burnDown: {
      data: burnDownData,
      totalEstimate: Math.round(totalEstimateMins / 60),
    },
    velocity: {
      data: velocityData,
      averagePerWeek,
      averageMinsPerWeek,
      lookbackWeeks: velocityWeeks,
      trend: velocityTrend,
    },
    blockedTasks,
    staleProjects,
    upcomingMilestones,
    gtdHealth: {
      inboxCount,
      daysSinceReview,
      lastReviewDate: lastReview?.completedAt
        ? new Date(lastReview.completedAt).toISOString().slice(0, 10)
        : null,
      stuckProjects,
      cascade: {
        thisWeek: cascadeThisWeek,
        lastWeek: cascadeLastWeek,
        sparkline: cascadeSparkline,
      },
    },
    horizonAlignment: {
      areas: areas.map((a) => ({
        id: a.id,
        name: a.name,
        projectCount: a.projects.length,
        goalCount: a.goals.length,
      })),
      disconnectedProjectCount,
      orphanGoals,
    },
  });
}
