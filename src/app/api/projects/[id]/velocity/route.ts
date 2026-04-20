import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound } from "@/lib/api/auth-helpers";

type Unit = "tasks" | "hours";

const VALID_WEEKS = [4, 12, 26];

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const unitOverride = req.nextUrl.searchParams.get("unit");
  const weeksParam = parseInt(req.nextUrl.searchParams.get("weeks") ?? "12", 10);
  const weeks = VALID_WEEKS.includes(weeksParam) ? weeksParam : 12;

  // 1. Fetch root project with child projects (2 levels deep) + velocityUnit
  const project = await prisma.project.findFirst({
    where: { id: params.id, userId },
    select: {
      id: true,
      velocityUnit: true,
      childProjects: {
        select: {
          id: true,
          childProjects: {
            select: { id: true },
          },
        },
      },
    },
  });

  if (!project) return notFound("Project not found");

  // 2. Collect all project IDs from tree
  const projectIds: string[] = [project.id];
  for (const child of project.childProjects) {
    projectIds.push(child.id);
    for (const grandchild of child.childProjects) {
      projectIds.push(grandchild.id);
    }
  }
  const projectIdSet = new Set(projectIds);

  // 3. Fetch all tasks in the project tree
  const tasks = await prisma.task.findMany({
    where: { projectId: { in: projectIds }, userId },
    select: {
      id: true,
      status: true,
      estimatedMins: true,
      actualMinutes: true,
      completedAt: true,
      createdAt: true,
      projectId: true,
    },
  });

  // 4. Resolve unit: explicit override > DB setting > auto-detect
  let unit: Unit;
  if (unitOverride === "hours") {
    unit = "hours";
  } else if (unitOverride === "tasks") {
    unit = "tasks";
  } else if (unitOverride === "auto" || !unitOverride) {
    // Auto-detect or no param: check DB setting, fall back to auto-detect
    if (!unitOverride && project.velocityUnit === "HOURS") {
      unit = "hours";
    } else if (!unitOverride && project.velocityUnit === "TASKS") {
      unit = "tasks";
    } else {
      const withEstimate = tasks.filter((t) => t.estimatedMins && t.estimatedMins > 0).length;
      unit = tasks.length > 0 && withEstimate / tasks.length >= 0.8 ? "hours" : "tasks";
    }
  } else {
    unit = "tasks";
  }

  // 5. Build value map and check estimate coverage
  const valueMap = new Map<string, number>();
  const warnings: string[] = [];
  let tasksWithoutEstimates = 0;

  for (const t of tasks) {
    if (unit === "hours") {
      if (!t.estimatedMins) tasksWithoutEstimates++;
      valueMap.set(t.id, (t.estimatedMins || 0) / 60);
    } else {
      valueMap.set(t.id, 1);
    }
  }

  if (
    unit === "hours" &&
    tasks.length > 0 &&
    tasksWithoutEstimates / tasks.length > 0.3
  ) {
    const pct = Math.round((tasksWithoutEstimates / tasks.length) * 100);
    warnings.push(
      `${pct}% of tasks have no time estimate — hours chart may not reflect actual effort`
    );
  }

  // 6. Build velocity data grouped by ISO week (Monday start)
  const now = new Date();
  const lookbackMs = weeks * 7 * 24 * 60 * 60 * 1000;
  const windowStart = new Date(now.getTime() - lookbackMs);

  const completedInWindow = tasks.filter(
    (t) =>
      t.status === "COMPLETED" &&
      t.completedAt &&
      t.completedAt >= windowStart
  );

  const weekMap = new Map<
    string,
    { completedCount: number; completedMins: number }
  >();

  for (const task of completedInWindow) {
    const completedDate = new Date(task.completedAt!);
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

  // 7. Fetch TaskEvents for scope tracking within window
  const taskIds = tasks.map((t) => t.id);
  const scopeEvents =
    taskIds.length > 0
      ? await prisma.taskEvent.findMany({
          where: {
            taskId: { in: taskIds },
            createdAt: { gte: windowStart },
            eventType: {
              in: [
                "CREATED",
                "MOVED_TO_PROJECT",
                "REMOVED_FROM_PROJECT",
                "STATUS_CHANGED",
              ],
            },
          },
          select: {
            taskId: true,
            eventType: true,
            changes: true,
            createdAt: true,
          },
          orderBy: { createdAt: "asc" },
        })
      : [];

  // 8. Aggregate scope changes per week
  const scopeWeekMap = new Map<
    string,
    { tasksAdded: number; tasksRemoved: number }
  >();

  for (const evt of scopeEvents) {
    const day = evt.createdAt.getDay();
    const monday = new Date(evt.createdAt);
    monday.setDate(monday.getDate() - ((day + 6) % 7));
    const weekKey = monday.toISOString().slice(0, 10);

    if (!scopeWeekMap.has(weekKey)) {
      scopeWeekMap.set(weekKey, { tasksAdded: 0, tasksRemoved: 0 });
    }
    const entry = scopeWeekMap.get(weekKey)!;

    const changes = evt.changes as Record<
      string,
      { old: unknown; new: unknown }
    > | null;

    switch (evt.eventType) {
      case "CREATED":
        entry.tasksAdded++;
        break;
      case "MOVED_TO_PROJECT": {
        const newProjId = changes?.projectId?.new as string | null;
        const oldProjId = changes?.projectId?.old as string | null;
        if (newProjId && projectIdSet.has(newProjId)) {
          if (!oldProjId || !projectIdSet.has(oldProjId)) {
            entry.tasksAdded++;
          }
        } else if (oldProjId && projectIdSet.has(oldProjId)) {
          entry.tasksRemoved++;
        }
        break;
      }
      case "REMOVED_FROM_PROJECT": {
        const removedFrom = changes?.projectId?.old as string | null;
        if (removedFrom && projectIdSet.has(removedFrom)) {
          entry.tasksRemoved++;
        }
        break;
      }
      case "STATUS_CHANGED": {
        const newStatus = changes?.status?.new as string | null;
        const oldStatus = changes?.status?.old as string | null;
        if (newStatus === "DROPPED") {
          entry.tasksRemoved++;
        } else if (oldStatus === "DROPPED") {
          entry.tasksAdded++;
        }
        break;
      }
    }
  }

  // 9. Combine velocity + scope data, sorted by week
  const allWeekKeys = new Set<string>();
  weekMap.forEach((_, k) => allWeekKeys.add(k));
  scopeWeekMap.forEach((_, k) => allWeekKeys.add(k));
  const velocityData = Array.from(allWeekKeys)
    .sort()
    .map((week) => {
      const vel = weekMap.get(week) ?? { completedCount: 0, completedMins: 0 };
      const scope = scopeWeekMap.get(week);
      return {
        week,
        completedCount: vel.completedCount,
        completedMins: vel.completedMins,
        ...(scope
          ? {
              scopeChange: {
                tasksAdded: scope.tasksAdded,
                tasksRemoved: scope.tasksRemoved,
                net: scope.tasksAdded - scope.tasksRemoved,
              },
            }
          : {}),
      };
    });

  // 10. Compute averages
  const totalCount = velocityData.reduce((s, v) => s + v.completedCount, 0);
  const totalMins = velocityData.reduce((s, v) => s + v.completedMins, 0);
  const numWeeks = velocityData.length || 1;

  let averagePerWeek: number;
  if (unit === "hours") {
    averagePerWeek =
      Math.round((totalMins / numWeeks / 60) * 10) / 10;
  } else {
    averagePerWeek = Math.round(totalCount / numWeeks);
  }

  const averageMinsPerWeek = Math.round(totalMins / numWeeks);

  // 11. Compute trend: last-4-week avg vs previous-4-week avg
  let trend: { direction: "up" | "down"; percent: number } | null = null;

  if (velocityData.length >= 8) {
    const recentWeeks = velocityData.slice(-4);
    const previousWeeks = velocityData.slice(-8, -4);

    const weekAvg = (
      weeks: typeof velocityData,
      u: Unit
    ): number => {
      if (u === "hours") {
        return weeks.reduce((s, w) => s + w.completedMins, 0) / weeks.length / 60;
      }
      return weeks.reduce((s, w) => s + w.completedCount, 0) / weeks.length;
    };

    const recentAvg = weekAvg(recentWeeks, unit);
    const previousAvg = weekAvg(previousWeeks, unit);

    if (previousAvg > 0) {
      const changePct = ((recentAvg - previousAvg) / previousAvg) * 100;
      if (Math.abs(changePct) >= 5) {
        trend = {
          direction: changePct > 0 ? "up" : "down",
          percent: Math.round(Math.abs(changePct)),
        };
      }
    }
  }

  // 12. Compute velocity multiplier from tasks with both estimated and actual time
  const allCompleted = tasks.filter((t) => t.status === "COMPLETED");
  const tasksWithBoth = allCompleted.filter(
    (t) => t.estimatedMins && t.estimatedMins > 0 && t.actualMinutes && t.actualMinutes > 0
  );
  const velocityMultiplier =
    tasksWithBoth.length >= 5
      ? tasksWithBoth.reduce((sum, t) => sum + t.actualMinutes!, 0) /
        tasksWithBoth.reduce((sum, t) => sum + t.estimatedMins!, 0)
      : null;

  return NextResponse.json({
    data: velocityData,
    averagePerWeek,
    averageMinsPerWeek,
    trend,
    velocityMultiplier,
    meta: { unit, lookbackWeeks: weeks },
    warnings,
  });
}
