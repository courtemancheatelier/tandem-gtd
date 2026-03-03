import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound } from "@/lib/api/auth-helpers";

type Unit = "tasks" | "hours";

interface BurnUpPoint {
  date: string;
  scope: number;
  completed: number;
  ideal?: number;
}

interface ScopeChange {
  date: string;
  delta: number;
  reason: string;
}

interface Convergence {
  date: string | null;
  display: string | null;
  daysFromNow: number | null;
  isPastDeadline: boolean;
  completionVelocityPerWeek: number;
  scopeVelocityPerWeek: number;
  isConverging: boolean;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const unitOverride = req.nextUrl.searchParams.get("unit");

  // 1. Fetch root project with child projects (2 levels deep)
  const project = await prisma.project.findFirst({
    where: { id: params.id, userId },
    select: {
      id: true,
      createdAt: true,
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
      createdAt: true,
      completedAt: true,
      projectId: true,
    },
  });

  // Resolve unit: explicit override > DB setting > auto-detect
  let unit: Unit;
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

  // Build value map: task ID → numeric value based on unit
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

  if (unit === "hours" && tasksWithoutEstimates > 0) {
    const pct = Math.round((tasksWithoutEstimates / tasks.length) * 100);
    warnings.push(
      `${tasksWithoutEstimates} of ${tasks.length} tasks (${pct}%) lack time estimates — hours chart may be incomplete`
    );
  }

  // 4. Fetch relevant TaskEvents
  const taskIds = tasks.map((t) => t.id);

  const events =
    taskIds.length > 0
      ? await prisma.taskEvent.findMany({
          where: {
            taskId: { in: taskIds },
            eventType: {
              in: [
                "CREATED",
                "COMPLETED",
                "REOPENED",
                "STATUS_CHANGED",
                "MOVED_TO_PROJECT",
                "REMOVED_FROM_PROJECT",
              ],
            },
          },
          select: {
            id: true,
            taskId: true,
            eventType: true,
            changes: true,
            createdAt: true,
          },
          orderBy: { createdAt: "asc" },
        })
      : [];

  // 5. Walk events chronologically to build scope & completed timelines
  let scope = 0;
  let completed = 0;
  const taskIdsWithCreatedEvent = new Set<string>();
  const rawPoints: { date: Date; scope: number; completed: number }[] = [];

  // Track significant scope changes for annotations
  const scopeDeltas: { date: Date; delta: number; eventType: string }[] = [];

  for (const evt of events) {
    const val = valueMap.get(evt.taskId) ?? (unit === "tasks" ? 1 : 0);
    const changes = evt.changes as Record<
      string,
      { old: unknown; new: unknown }
    > | null;
    let scopeDelta = 0;

    switch (evt.eventType) {
      case "CREATED":
        taskIdsWithCreatedEvent.add(evt.taskId);
        scope += val;
        scopeDelta = val;
        break;

      case "MOVED_TO_PROJECT": {
        const newProjId = changes?.projectId?.new as string | null;
        const oldProjId = changes?.projectId?.old as string | null;
        if (newProjId && projectIdSet.has(newProjId)) {
          // Moved into our tree
          if (!oldProjId || !projectIdSet.has(oldProjId)) {
            scope += val;
            scopeDelta = val;
          }
        } else if (oldProjId && projectIdSet.has(oldProjId)) {
          // Moved out of our tree
          scope -= val;
          scopeDelta = -val;
        }
        break;
      }

      case "REMOVED_FROM_PROJECT": {
        const removedFrom = changes?.projectId?.old as string | null;
        if (removedFrom && projectIdSet.has(removedFrom)) {
          scope -= val;
          scopeDelta = -val;
        }
        break;
      }

      case "STATUS_CHANGED": {
        const newStatus = changes?.status?.new as string | null;
        const oldStatus = changes?.status?.old as string | null;
        if (newStatus === "DROPPED") {
          scope -= val;
          scopeDelta = -val;
        } else if (oldStatus === "DROPPED") {
          scope += val;
          scopeDelta = val;
        }
        break;
      }

      case "COMPLETED":
        completed += val;
        break;

      case "REOPENED":
        completed -= val;
        break;
    }

    if (scopeDelta !== 0) {
      scopeDeltas.push({
        date: evt.createdAt,
        delta: scopeDelta,
        eventType: evt.eventType,
      });
    }

    rawPoints.push({
      date: evt.createdAt,
      scope: Math.max(0, scope),
      completed: Math.max(0, completed),
    });
  }

  // 6. Pre-history reconciliation: tasks without CREATED events
  const liveScopeValue = tasks
    .filter((t) => t.status !== "DROPPED")
    .reduce((sum, t) => sum + (valueMap.get(t.id) ?? 0), 0);
  const liveCompletedValue = tasks
    .filter((t) => t.status === "COMPLETED")
    .reduce((sum, t) => sum + (valueMap.get(t.id) ?? 0), 0);

  // Count tasks that existed before the event system
  const preHistoryTasks = tasks.filter(
    (t) => !taskIdsWithCreatedEvent.has(t.id)
  );
  const preHistoryScope = preHistoryTasks
    .filter((t) => t.status !== "DROPPED")
    .reduce((sum, t) => sum + (valueMap.get(t.id) ?? 0), 0);

  // Adjust: prepend a synthetic starting point at project creation
  if (preHistoryScope > 0) {
    // Shift all event-derived values up by the pre-history baseline
    for (const pt of rawPoints) {
      pt.scope += preHistoryScope;
    }
    scope += preHistoryScope;

    // Also account for pre-history completions
    const preHistoryCompleted = preHistoryTasks
      .filter((t) => t.status === "COMPLETED")
      .reduce((sum, t) => sum + (valueMap.get(t.id) ?? 0), 0);
    for (const pt of rawPoints) {
      pt.completed += preHistoryCompleted;
    }
    completed += preHistoryCompleted;

    // Insert synthetic starting point
    rawPoints.unshift({
      date: project.createdAt,
      scope: preHistoryScope,
      completed: 0,
    });
  }

  // If no events at all, use current state
  if (rawPoints.length === 0) {
    rawPoints.push({
      date: project.createdAt,
      scope: liveScopeValue,
      completed: 0,
    });
  }

  // Ensure final point reflects live state (drift correction)
  const now = new Date();
  scope = liveScopeValue;
  completed = liveCompletedValue;

  rawPoints.push({
    date: now,
    scope,
    completed,
  });

  // 7. Sample at regular intervals
  const startDate = rawPoints[0].date;
  const totalDays = Math.ceil(
    (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  const intervalDays = totalDays <= 60 ? 1 : 7;

  const data: BurnUpPoint[] = [];
  let ptIdx = 0;
  let lastScope = rawPoints[0].scope;
  let lastCompleted = rawPoints[0].completed;

  for (let dayOffset = 0; dayOffset <= totalDays; dayOffset += intervalDays) {
    const sampleDate = new Date(startDate);
    sampleDate.setDate(sampleDate.getDate() + dayOffset);

    // Advance pointer, carry forward last known values
    while (
      ptIdx < rawPoints.length &&
      rawPoints[ptIdx].date <= sampleDate
    ) {
      lastScope = rawPoints[ptIdx].scope;
      lastCompleted = rawPoints[ptIdx].completed;
      ptIdx++;
    }

    data.push({
      date: sampleDate.toISOString().slice(0, 10),
      scope: round2(lastScope),
      completed: round2(lastCompleted),
    });
  }

  // Always include today as final point
  const todayStr = now.toISOString().slice(0, 10);
  if (data.length === 0 || data[data.length - 1].date !== todayStr) {
    data.push({
      date: todayStr,
      scope: round2(scope),
      completed: round2(completed),
    });
  } else {
    // Update last point with live data
    const last = data[data.length - 1];
    last.scope = round2(scope);
    last.completed = round2(completed);
  }

  // 8. Ideal line (no targetDate on Project model yet — placeholder for future)
  // targetDate would enable: linear from (createdAt, 0) to (targetDate, currentScope)
  const targetDate: string | null = null;

  // 9. Compute 4-week rolling velocities
  const fourWeeksAgo = new Date(now);
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

  const recentCompletions = tasks.filter(
    (t) =>
      t.status === "COMPLETED" &&
      t.completedAt &&
      t.completedAt >= fourWeeksAgo
  );
  const completionValueInWindow = recentCompletions.reduce(
    (sum, t) => sum + (valueMap.get(t.id) ?? 0),
    0
  );
  const completionVelocityPerWeek = completionValueInWindow / 4;

  // Scope velocity: net scope change in last 4 weeks from events
  const recentScopeEvents = events.filter(
    (e) => e.createdAt >= fourWeeksAgo
  );
  let recentScopeChange = 0;
  for (const evt of recentScopeEvents) {
    const val = valueMap.get(evt.taskId) ?? (unit === "tasks" ? 1 : 0);
    const changes = evt.changes as Record<
      string,
      { old: unknown; new: unknown }
    > | null;

    switch (evt.eventType) {
      case "CREATED":
        recentScopeChange += val;
        break;
      case "MOVED_TO_PROJECT": {
        const newProjId = changes?.projectId?.new as string | null;
        const oldProjId = changes?.projectId?.old as string | null;
        if (newProjId && projectIdSet.has(newProjId)) {
          if (!oldProjId || !projectIdSet.has(oldProjId)) {
            recentScopeChange += val;
          }
        } else if (oldProjId && projectIdSet.has(oldProjId)) {
          recentScopeChange -= val;
        }
        break;
      }
      case "REMOVED_FROM_PROJECT": {
        const removedFrom = changes?.projectId?.old as string | null;
        if (removedFrom && projectIdSet.has(removedFrom)) {
          recentScopeChange -= val;
        }
        break;
      }
      case "STATUS_CHANGED": {
        const newStatus = changes?.status?.new as string | null;
        const oldStatus = changes?.status?.old as string | null;
        if (newStatus === "DROPPED") recentScopeChange -= val;
        else if (oldStatus === "DROPPED") recentScopeChange += val;
        break;
      }
    }
  }
  const scopeVelocityPerWeek = recentScopeChange / 4;

  // 10. Project forward: projected completion and scope lines
  const gap = scope - completed;
  const netVelocity = completionVelocityPerWeek - scopeVelocityPerWeek;
  const isConverging = netVelocity > 0 && gap > 0;

  const projectedCompletionPoints: { date: string; projected: number }[] = [];
  const projectedScopePoints: { date: string; projectedScope: number }[] = [];

  if (completionVelocityPerWeek > 0) {
    // Project completion line forward 12 weeks max
    const startProjected = completed;
    projectedCompletionPoints.push({ date: todayStr, projected: round2(startProjected) });
    for (let w = 1; w <= 12; w++) {
      const d = new Date(now);
      d.setDate(d.getDate() + w * 7);
      const val = startProjected + completionVelocityPerWeek * w;
      if (val > scope * 2) break; // Don't project absurdly far
      projectedCompletionPoints.push({
        date: d.toISOString().slice(0, 10),
        projected: round2(val),
      });
    }
  }

  if (scopeVelocityPerWeek !== 0) {
    const startScope = scope;
    projectedScopePoints.push({ date: todayStr, projectedScope: round2(startScope) });
    for (let w = 1; w <= 12; w++) {
      const d = new Date(now);
      d.setDate(d.getDate() + w * 7);
      const val = startScope + scopeVelocityPerWeek * w;
      if (val < 0) break;
      projectedScopePoints.push({
        date: d.toISOString().slice(0, 10),
        projectedScope: round2(val),
      });
    }
  }

  // 11. Convergence calculation
  let convergence: Convergence | null = null;
  if (gap > 0) {
    if (isConverging) {
      const weeksToConverge = gap / netVelocity;
      const convergeDate = new Date(now);
      convergeDate.setDate(
        convergeDate.getDate() + Math.ceil(weeksToConverge * 7)
      );

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const daysFromNow = Math.ceil(
        (convergeDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );

      const display = convergeDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year:
          convergeDate.getFullYear() !== today.getFullYear()
            ? "numeric"
            : undefined,
      });

      convergence = {
        date: convergeDate.toISOString().slice(0, 10),
        display,
        daysFromNow,
        isPastDeadline: false, // No targetDate to compare against yet
        completionVelocityPerWeek: round2(completionVelocityPerWeek),
        scopeVelocityPerWeek: round2(scopeVelocityPerWeek),
        isConverging: true,
      };
    } else {
      convergence = {
        date: null,
        display: null,
        daysFromNow: null,
        isPastDeadline: false,
        completionVelocityPerWeek: round2(completionVelocityPerWeek),
        scopeVelocityPerWeek: round2(scopeVelocityPerWeek),
        isConverging: false,
      };
    }
  }

  // 12. Significant scope changes (abs(delta) > 10% of max scope, top 5)
  const maxScope = Math.max(...data.map((d) => d.scope), 1);
  const threshold = maxScope * 0.1;

  // Aggregate deltas by day
  const dailyDeltas = new Map<string, number>();
  for (const sd of scopeDeltas) {
    const dayKey = sd.date.toISOString().slice(0, 10);
    dailyDeltas.set(dayKey, (dailyDeltas.get(dayKey) ?? 0) + sd.delta);
  }

  const scopeChanges: ScopeChange[] = Array.from(dailyDeltas.entries())
    .filter(([, delta]) => Math.abs(delta) >= threshold)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 5)
    .map(([date, delta]) => ({
      date,
      delta: round2(delta),
      reason:
        delta > 0
          ? `+${round2(delta)} ${unit} added`
          : `${round2(delta)} ${unit} removed`,
    }));

  return NextResponse.json({
    data,
    projectedCompletionPoints,
    projectedScopePoints,
    scopeChanges,
    convergence,
    meta: {
      unit,
      targetDate,
      currentScope: round2(scope),
      currentCompleted: round2(completed),
    },
    warnings,
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
