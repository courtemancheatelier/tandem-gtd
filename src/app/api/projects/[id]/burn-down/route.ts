import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound } from "@/lib/api/auth-helpers";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const unitOverride = req.nextUrl.searchParams.get("unit");

  // 1. Fetch root project with child projects (2 levels deep), plus targetDate/createdAt
  const project = await prisma.project.findFirst({
    where: { id: params.id, userId },
    select: {
      id: true,
      createdAt: true,
      targetDate: true,
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

  // 2. Collect all project IDs from tree (up to 2 levels deep)
  const projectIds: string[] = [project.id];
  for (const child of project.childProjects) {
    projectIds.push(child.id);
    for (const grandchild of child.childProjects) {
      projectIds.push(grandchild.id);
    }
  }

  // 3. Fetch all tasks in the project tree
  const tasks = await prisma.task.findMany({
    where: { projectId: { in: projectIds }, userId },
    select: {
      id: true,
      status: true,
      estimatedMins: true,
      completedAt: true,
    },
  });

  // 4. Resolve unit: explicit override > DB setting > auto-detect
  let unit: "tasks" | "hours";
  if (unitOverride === "hours") {
    unit = "hours";
  } else if (unitOverride === "tasks") {
    unit = "tasks";
  } else if (unitOverride === "auto" || !unitOverride) {
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

  // 5. Compute burn-down data (30-day lookback, 7-day intervals)
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const activeTasks = tasks.filter((t) => t.status !== "DROPPED");
  const warnings: string[] = [];

  // Unit-specific total
  let total: number;
  if (unit === "tasks") {
    total = activeTasks.length;
  } else {
    total = activeTasks.reduce((sum, t) => sum + (t.estimatedMins || 0), 0);
    // Warn if many tasks lack estimates
    const withEstimate = activeTasks.filter((t) => t.estimatedMins && t.estimatedMins > 0).length;
    const withoutEstimate = activeTasks.length - withEstimate;
    if (activeTasks.length > 0 && withoutEstimate / activeTasks.length > 0.3) {
      const pct = Math.round((withoutEstimate / activeTasks.length) * 100);
      warnings.push(`${pct}% of tasks have no time estimate — chart may not reflect actual effort`);
    }
  }

  const completedInWindow = activeTasks
    .filter(
      (t) =>
        t.status === "COMPLETED" &&
        t.completedAt &&
        t.completedAt >= thirtyDaysAgo
    )
    .sort(
      (a, b) =>
        new Date(a.completedAt!).getTime() - new Date(b.completedAt!).getTime()
    );

  const burnDownData: { date: string; remaining: number; ideal?: number }[] = [];
  const totalDays = 30;
  let cumulativeCompleted = 0;
  let completedIdx = 0;

  // Calculate already completed before the window
  if (unit === "tasks") {
    cumulativeCompleted = activeTasks.filter(
      (t) =>
        t.status === "COMPLETED" &&
        t.completedAt &&
        t.completedAt < thirtyDaysAgo
    ).length;
  } else {
    cumulativeCompleted = activeTasks
      .filter(
        (t) =>
          t.status === "COMPLETED" &&
          t.completedAt &&
          t.completedAt < thirtyDaysAgo
      )
      .reduce((sum, t) => sum + (t.estimatedMins || 0), 0);
  }

  // Ideal line computation helpers
  const targetDate = project.targetDate ? new Date(project.targetDate) : null;
  const idealStartDate = new Date(
    Math.max(project.createdAt.getTime(), thirtyDaysAgo.getTime())
  );

  function computeIdeal(date: Date): number | undefined {
    if (!targetDate) return undefined;
    if (date >= targetDate) return 0;
    if (date <= idealStartDate) return unit === "tasks" ? total : Math.round(total / 60);
    const elapsed = date.getTime() - idealStartDate.getTime();
    const totalSpan = targetDate.getTime() - idealStartDate.getTime();
    if (totalSpan <= 0) return 0;
    const rawTotal = unit === "tasks" ? total : total / 60;
    return Math.round(rawTotal * (1 - elapsed / totalSpan));
  }

  for (let dayOffset = 0; dayOffset <= totalDays; dayOffset += 7) {
    const date = new Date(thirtyDaysAgo);
    date.setDate(date.getDate() + dayOffset);
    const dateStr = date.toISOString().slice(0, 10);

    while (
      completedIdx < completedInWindow.length &&
      new Date(completedInWindow[completedIdx].completedAt!) <= date
    ) {
      if (unit === "tasks") {
        cumulativeCompleted++;
      } else {
        cumulativeCompleted += completedInWindow[completedIdx].estimatedMins || 0;
      }
      completedIdx++;
    }

    const remaining = Math.max(0, total - cumulativeCompleted);
    const point: { date: string; remaining: number; ideal?: number } = {
      date: dateStr,
      remaining: unit === "tasks" ? remaining : Math.round(remaining / 60),
    };

    const ideal = computeIdeal(date);
    if (ideal !== undefined) {
      point.ideal = ideal;
    }

    burnDownData.push(point);
  }

  // Always include today as the final actual data point
  const todayStr = now.toISOString().slice(0, 10);
  const lastPointDate = burnDownData[burnDownData.length - 1]?.date;
  if (lastPointDate !== todayStr) {
    while (completedIdx < completedInWindow.length) {
      if (unit === "tasks") {
        cumulativeCompleted++;
      } else {
        cumulativeCompleted += completedInWindow[completedIdx].estimatedMins || 0;
      }
      completedIdx++;
    }
    const remaining = Math.max(0, total - cumulativeCompleted);
    const point: { date: string; remaining: number; ideal?: number } = {
      date: todayStr,
      remaining: unit === "tasks" ? remaining : Math.round(remaining / 60),
    };

    const ideal = computeIdeal(now);
    if (ideal !== undefined) {
      point.ideal = ideal;
    }

    burnDownData.push(point);
  }

  // 5. Extend chart with future ideal-only data points up to targetDate
  // These points have no "remaining" value so the Actual line stops at today
  if (targetDate && targetDate > now) {
    const lastActualDate = new Date(burnDownData[burnDownData.length - 1].date + "T00:00:00");
    const daysToTarget = Math.ceil((targetDate.getTime() - lastActualDate.getTime()) / (1000 * 60 * 60 * 24));
    const step = Math.max(7, Math.ceil(daysToTarget / 8));

    for (let d = step; ; d += step) {
      const futureDate = new Date(lastActualDate);
      futureDate.setDate(futureDate.getDate() + d);
      if (futureDate > targetDate) break;
      const ideal = computeIdeal(futureDate);
      if (ideal !== undefined) {
        burnDownData.push({ date: futureDate.toISOString().slice(0, 10), ideal } as typeof burnDownData[number]);
      }
    }
    // Always include the target date itself (ideal = 0)
    const targetStr = targetDate.toISOString().slice(0, 10);
    if (burnDownData[burnDownData.length - 1].date !== targetStr) {
      burnDownData.push({ date: targetStr, ideal: 0 } as typeof burnDownData[number]);
    }
  }

  // 6. Compute velocity data (last 12 weeks)
  const twelveWeeksAgo = new Date(now);
  twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84);

  const completedRecently = tasks.filter(
    (t) =>
      t.status === "COMPLETED" &&
      t.completedAt &&
      t.completedAt >= twelveWeeksAgo
  );

  const weekMap = new Map<
    string,
    { completedCount: number; completedMins: number }
  >();

  for (const task of completedRecently) {
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

  const velocityData = Array.from(weekMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, data]) => ({
      week,
      completedCount: data.completedCount,
      completedMins: data.completedMins,
    }));

  const averagePerWeek =
    velocityData.length > 0
      ? Math.round(
          velocityData.reduce((sum, v) => sum + v.completedCount, 0) /
            velocityData.length
        )
      : 0;

  const averageMinsPerWeek =
    velocityData.length > 0
      ? Math.round(
          velocityData.reduce((sum, v) => sum + v.completedMins, 0) /
            velocityData.length
        )
      : 0;

  return NextResponse.json({
    burnDown: {
      data: burnDownData,
      totalEstimate: unit === "tasks" ? total : Math.round(total / 60),
      unit,
      targetDate: project.targetDate?.toISOString() ?? null,
    },
    velocity: {
      data: velocityData,
      averagePerWeek,
      averageMinsPerWeek,
    },
    warnings,
  });
}
