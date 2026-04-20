import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound } from "@/lib/api/auth-helpers";

/** GET /api/routines/:id/compliance?days=30 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const routine = await prisma.routine.findFirst({
    where: { id: params.id, userId },
    include: {
      windows: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, title: true, targetTime: true, sortOrder: true },
      },
    },
  });

  if (!routine) return notFound("Routine not found");

  const days = Math.min(
    parseInt(req.nextUrl.searchParams.get("days") || "30", 10) || 30,
    365
  );

  const fromDate = new Date();
  fromDate.setUTCDate(fromDate.getUTCDate() - days);
  fromDate.setUTCHours(0, 0, 0, 0);

  const toDate = new Date();
  toDate.setUTCHours(23, 59, 59, 999);

  // Fetch all logs in the date range
  const logs = await prisma.routineLog.findMany({
    where: {
      routineId: params.id,
      date: { gte: fromDate, lte: toDate },
    },
    select: {
      windowId: true,
      date: true,
      status: true,
    },
    orderBy: { date: "asc" },
  });

  // Build a lookup: windowId -> date string -> status
  const logMap = new Map<string, Map<string, string>>();
  for (const log of logs) {
    const dateStr = log.date.toISOString().slice(0, 10);
    if (!logMap.has(log.windowId)) logMap.set(log.windowId, new Map());
    logMap.get(log.windowId)!.set(dateStr, log.status);
  }

  // Figure out which dates the routine was active (routine created date to today)
  const routineStart = new Date(routine.createdAt);
  routineStart.setUTCHours(0, 0, 0, 0);
  const effectiveFrom = fromDate > routineStart ? fromDate : routineStart;

  // Build the list of active dates
  const activeDates: string[] = [];
  const cursor = new Date(effectiveFrom);
  const todayStr = new Date().toISOString().slice(0, 10);
  while (cursor <= toDate) {
    const dateStr = cursor.toISOString().slice(0, 10);
    if (dateStr <= todayStr) {
      activeDates.push(dateStr);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const totalActiveDays = activeDates.length;

  // Per-window stats
  const windowStats = routine.windows.map((window) => {
    const windowLogs = logMap.get(window.id) ?? new Map<string, string>();
    let completed = 0;
    let skipped = 0;
    let partial = 0;
    let missed = 0;

    for (const date of activeDates) {
      const status = windowLogs.get(date);
      if (status === "completed") completed++;
      else if (status === "skipped") skipped++;
      else if (status === "partial") partial++;
      else missed++; // no log = missed
    }

    return {
      windowId: window.id,
      title: window.title,
      targetTime: window.targetTime,
      sortOrder: window.sortOrder,
      completed,
      skipped,
      partial,
      missed,
      total: totalActiveDays,
      completionRate: totalActiveDays > 0
        ? Math.round((completed / totalActiveDays) * 100)
        : 0,
    };
  });

  // Overall stats
  const totalSlots = totalActiveDays * routine.windows.length;
  const totalCompleted = windowStats.reduce((sum, w) => sum + w.completed, 0);
  const totalSkipped = windowStats.reduce((sum, w) => sum + w.skipped, 0);
  const totalPartial = windowStats.reduce((sum, w) => sum + w.partial, 0);
  const totalMissed = windowStats.reduce((sum, w) => sum + w.missed, 0);

  // Current streak: consecutive days with ALL windows completed/skipped/partial (going backwards from today)
  let currentStreak = 0;
  for (let i = activeDates.length - 1; i >= 0; i--) {
    const date = activeDates[i];
    const allComplete = routine.windows.every((w) => {
      const status = logMap.get(w.id)?.get(date);
      return status === "completed" || status === "skipped" || status === "partial";
    });
    if (allComplete) {
      currentStreak++;
    } else {
      break;
    }
  }

  // Best streak
  let bestStreak = 0;
  let runStreak = 0;
  for (const date of activeDates) {
    const allComplete = routine.windows.every((w) => {
      const status = logMap.get(w.id)?.get(date);
      return status === "completed" || status === "skipped" || status === "partial";
    });
    if (allComplete) {
      runStreak++;
      if (runStreak > bestStreak) bestStreak = runStreak;
    } else {
      runStreak = 0;
    }
  }

  // Daily grid: date -> per-window status array
  const dailyGrid = activeDates.map((date) => ({
    date,
    windows: routine.windows.map((w) => ({
      windowId: w.id,
      status: logMap.get(w.id)?.get(date) ?? "missed",
    })),
  }));

  return NextResponse.json({
    routineId: routine.id,
    routineTitle: routine.title,
    color: routine.color,
    days,
    totalActiveDays,
    overall: {
      totalSlots,
      completed: totalCompleted,
      skipped: totalSkipped,
      partial: totalPartial,
      missed: totalMissed,
      completionRate: totalSlots > 0
        ? Math.round((totalCompleted / totalSlots) * 100)
        : 0,
      currentStreak,
      bestStreak,
    },
    windows: windowStats,
    dailyGrid,
  });
}
