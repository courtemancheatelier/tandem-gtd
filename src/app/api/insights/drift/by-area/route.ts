import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api/auth-helpers";

export async function GET(req: NextRequest) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { driftDashboardEnabled: true },
  });
  if (!user?.driftDashboardEnabled) {
    return NextResponse.json({ error: "Drift dashboard disabled" }, { status: 403 });
  }

  const areaId = req.nextUrl.searchParams.get("areaId") ?? undefined;
  const goalId = req.nextUrl.searchParams.get("goalId") ?? undefined;
  const routineId = req.nextUrl.searchParams.get("routineId") ?? undefined;

  // Get all areas with their project tasks
  const areas = await prisma.area.findMany({
    where: {
      userId,
      ...(areaId && { id: areaId }),
    },
    include: {
      projects: {
        where: {
          ...(goalId && { goalId }),
        },
        select: {
          id: true,
          tasks: {
            where: {
              ...(routineId && { routineId }),
            },
            select: {
              deferralCount: true,
              dueDatePushCount: true,
              totalDriftDays: true,
              status: true,
            },
          },
        },
      },
    },
  });

  // Also get routine-linked tasks per area (Card File tasks without projects)
  const now = new Date();

  const result = await Promise.all(
    areas.map(async (area) => {
      const projectIds = area.projects.map((p) => p.id);
      const projectTasks = area.projects.flatMap((p) => p.tasks);

      // Get tasks from routines belonging to this area (no project link)
      const routineTasks = await prisma.task.findMany({
        where: {
          userId,
          projectId: null,
          routine: { areaId: area.id },
          ...(routineId && { routineId }),
        },
        select: {
          deferralCount: true,
          dueDatePushCount: true,
          totalDriftDays: true,
          status: true,
        },
      });

      // If goal filter is active, skip routine tasks (routines don't have goals)
      const allTasks = goalId ? projectTasks : [...projectTasks, ...routineTasks];

      const driftedTasks = allTasks.filter(
        (t) => t.deferralCount > 0 || t.dueDatePushCount > 0
      );
      const totalDeferrals = allTasks.reduce((sum, t) => sum + t.deferralCount + t.dueDatePushCount, 0);
      const totalTasks = allTasks.length;

      // Drift score: 0–100 based on percentage of tasks with drift
      const driftScore = totalTasks > 0
        ? Math.round((driftedTasks.length / totalTasks) * 100)
        : 0;

      // 8-week sparkline: weekly deferral event counts
      // Include both project-linked and routine-linked tasks
      const sparkline: number[] = [];

      // Get routine IDs for this area
      const areaRoutines = await prisma.routine.findMany({
        where: { userId, areaId: area.id, isActive: true, ...(routineId && { id: routineId }) },
        select: { id: true },
      });
      const areaRoutineIds = areaRoutines.map((r) => r.id);

      const hasTaskSources = projectIds.length > 0 || areaRoutineIds.length > 0;

      if (hasTaskSources) {
        for (let w = 7; w >= 0; w--) {
          const weekStart = new Date(now);
          weekStart.setDate(weekStart.getDate() - (w + 1) * 7);
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekEnd.getDate() + 7);

          const taskConditions = [];
          if (projectIds.length > 0) {
            taskConditions.push({ projectId: { in: projectIds } });
          }
          if (areaRoutineIds.length > 0 && !goalId) {
            taskConditions.push({ routineId: { in: areaRoutineIds }, projectId: null });
          }

          if (taskConditions.length === 0) {
            sparkline.push(0);
            continue;
          }

          const count = await prisma.taskEvent.count({
            where: {
              eventType: "DEFERRED",
              createdAt: { gte: weekStart, lt: weekEnd },
              task: {
                userId,
                OR: taskConditions,
              },
            },
          });
          sparkline.push(count);
        }
      } else {
        sparkline.push(...Array(8).fill(0));
      }

      return {
        id: area.id,
        name: area.name,
        driftScore,
        driftedTaskCount: driftedTasks.length,
        totalDeferrals,
        sparkline,
      };
    })
  );

  // Sort by drift score descending
  result.sort((a, b) => b.driftScore - a.driftScore);

  return NextResponse.json({ areas: result });
}
