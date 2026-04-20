import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api/auth-helpers";

export async function GET(req: NextRequest) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { searchParams } = new URL(req.url);
  const weekOfParam = searchParams.get("weekOf");

  // Default to current week's Monday
  let weekStart: Date;
  if (weekOfParam) {
    weekStart = new Date(weekOfParam);
  } else {
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? 6 : day - 1; // Monday = 0 offset
    weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
  }
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const dateRange = {
    gte: weekStart,
    lt: weekEnd,
  };

  // Tasks completed this week
  const tasksCompleted = await prisma.taskEvent.count({
    where: {
      task: { userId },
      eventType: "COMPLETED",
      createdAt: dateRange,
    },
  });

  // Tasks created this week
  const tasksCreated = await prisma.taskEvent.count({
    where: {
      task: { userId },
      eventType: "CREATED",
      createdAt: dateRange,
    },
  });

  // Cascade events count
  const cascadeEvents = await prisma.taskEvent.count({
    where: {
      task: { userId },
      source: "CASCADE",
      createdAt: dateRange,
    },
  });

  // Projects that had events this week (most active)
  const projectEvents = await prisma.projectEvent.findMany({
    where: {
      project: { userId },
      createdAt: dateRange,
    },
    select: {
      projectId: true,
      project: { select: { id: true, title: true } },
    },
  });

  // Count events per project
  const projectEventCounts = new Map<string, { id: string; title: string; count: number }>();
  for (const pe of projectEvents) {
    const existing = projectEventCounts.get(pe.projectId);
    if (existing) {
      existing.count += 1;
    } else {
      projectEventCounts.set(pe.projectId, {
        id: pe.project.id,
        title: pe.project.title,
        count: 1,
      });
    }
  }

  // Also count task events that belong to projects
  const taskEventsInProjects = await prisma.taskEvent.findMany({
    where: {
      task: { userId, projectId: { not: null } },
      createdAt: dateRange,
    },
    select: {
      task: {
        select: {
          projectId: true,
          project: { select: { id: true, title: true } },
        },
      },
    },
  });

  for (const te of taskEventsInProjects) {
    if (!te.task.projectId || !te.task.project) continue;
    const existing = projectEventCounts.get(te.task.projectId);
    if (existing) {
      existing.count += 1;
    } else {
      projectEventCounts.set(te.task.projectId, {
        id: te.task.project.id,
        title: te.task.project.title,
        count: 1,
      });
    }
  }

  const mostActiveProjects = Array.from(projectEventCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((p) => ({ id: p.id, title: p.title, eventCount: p.count }));

  // Projects advanced (had task completions)
  const projectsWithCompletions = await prisma.taskEvent.findMany({
    where: {
      task: { userId, projectId: { not: null } },
      eventType: "COMPLETED",
      createdAt: dateRange,
    },
    select: {
      task: {
        select: {
          projectId: true,
          project: { select: { id: true, title: true } },
        },
      },
    },
    distinct: ["taskId"],
  });

  const advancedProjectMap = new Map<string, { id: string; title: string }>();
  for (const te of projectsWithCompletions) {
    if (te.task.projectId && te.task.project) {
      advancedProjectMap.set(te.task.projectId, {
        id: te.task.project.id,
        title: te.task.project.title,
      });
    }
  }
  const projectsAdvanced = Array.from(advancedProjectMap.values());

  // Stale projects: active projects with no events this week
  const activeProjects = await prisma.project.findMany({
    where: { userId, status: "ACTIVE" },
    select: { id: true, title: true },
  });

  const activeProjectIdsWithEvents = new Set(projectEventCounts.keys());

  const staleProjects = activeProjects.filter(
    (p) => !activeProjectIdsWithEvents.has(p.id)
  );

  return NextResponse.json({
    weekOf: weekStart.toISOString().split("T")[0],
    tasksCompleted,
    tasksCreated,
    projectsAdvanced,
    cascadeEvents,
    staleProjects: staleProjects.map((p) => ({ id: p.id, title: p.title })),
    mostActiveProjects,
  });
}
