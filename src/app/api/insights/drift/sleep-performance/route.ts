import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api/auth-helpers";
import { computeWindowRange, DriftWindow } from "@/lib/drift/windows";

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

  const window = (req.nextUrl.searchParams.get("window") ?? "this-week") as DriftWindow;
  const { start, end, priorStart, priorEnd } = computeWindowRange(window);

  const computePeriod = async (periodStart: Date, periodEnd: Date) => {
    // Get all sleep logs in the period for this user
    const sleepLogs = await prisma.sleepLog.findMany({
      where: {
        userId,
        date: { gte: periodStart, lte: periodEnd },
        bedtime: { not: null },
      },
      orderBy: { date: "asc" },
    });

    if (sleepLogs.length === 0) {
      return null;
    }

    // Compute avg duration (only for complete logs with both bed + wake)
    const completeLogs = sleepLogs.filter((l) => l.durationMins != null);
    const avgDurationMins = completeLogs.length > 0
      ? Math.round(completeLogs.reduce((sum, l) => sum + l.durationMins!, 0) / completeLogs.length)
      : null;

    // On-time bedtime rate
    const logsWithOnTime = sleepLogs.filter((l) => l.bedtimeOnTime != null);
    const onTimeBedtimeRate = logsWithOnTime.length > 0
      ? Math.round((logsWithOnTime.filter((l) => l.bedtimeOnTime).length / logsWithOnTime.length) * 100)
      : null;

    // Build a map of sleep log date → bedtimeOnTime for next-day correlation
    const sleepByDate = new Map<string, boolean>();
    for (const log of sleepLogs) {
      if (log.bedtimeOnTime != null) {
        sleepByDate.set(log.date.toISOString().slice(0, 10), log.bedtimeOnTime);
      }
    }

    // Get task completions grouped by day in the period
    // We need "next day" completions, so extend the query by one day
    const extendedEnd = new Date(periodEnd);
    extendedEnd.setDate(extendedEnd.getDate() + 1);

    const completionEvents = await prisma.taskEvent.findMany({
      where: {
        eventType: "COMPLETED",
        createdAt: { gte: periodStart, lte: extendedEnd },
        task: { userId },
      },
      select: { createdAt: true },
    });

    // Get total tasks scheduled per day (for completion rate denominator)
    const scheduledTasks = await prisma.task.findMany({
      where: {
        userId,
        routineId: { not: null },
        scheduledDate: { gte: periodStart, lte: extendedEnd },
      },
      select: { scheduledDate: true, status: true },
    });

    // Group completions and scheduled by day
    const completionsByDay = new Map<string, number>();
    for (const e of completionEvents) {
      const day = e.createdAt.toISOString().slice(0, 10);
      completionsByDay.set(day, (completionsByDay.get(day) ?? 0) + 1);
    }

    const scheduledByDay = new Map<string, number>();
    for (const t of scheduledTasks) {
      if (t.scheduledDate) {
        const day = t.scheduledDate.toISOString().slice(0, 10);
        scheduledByDay.set(day, (scheduledByDay.get(day) ?? 0) + 1);
      }
    }

    // Compute next-day completion rates after late vs on-time nights
    let lateNightDays = 0;
    let lateNightCompletions = 0;
    let lateNightScheduled = 0;
    let onTimeNightDays = 0;
    let onTimeCompletions = 0;
    let onTimeScheduled = 0;

    sleepByDate.forEach((wasOnTime, dateStr) => {
      // Next day = date + 1
      const nextDay = new Date(dateStr + "T12:00:00.000Z");
      nextDay.setDate(nextDay.getDate() + 1);
      const nextDayStr = nextDay.toISOString().slice(0, 10);

      const dayCompletions = completionsByDay.get(nextDayStr) ?? 0;
      const dayScheduled = scheduledByDay.get(nextDayStr) ?? 0;

      if (wasOnTime) {
        onTimeNightDays++;
        onTimeCompletions += dayCompletions;
        onTimeScheduled += dayScheduled;
      } else {
        lateNightDays++;
        lateNightCompletions += dayCompletions;
        lateNightScheduled += dayScheduled;
      }
    });

    const lateNightCompletionRate = lateNightScheduled > 0
      ? Math.round((lateNightCompletions / lateNightScheduled) * 100)
      : null;
    const onTimeCompletionRate = onTimeScheduled > 0
      ? Math.round((onTimeCompletions / onTimeScheduled) * 100)
      : null;

    // Build daily chart data
    const daily: { date: string; deviationMins: number | null; nextDayCompletionRate: number | null }[] = [];

    for (const log of sleepLogs) {
      const dateStr = log.date.toISOString().slice(0, 10);

      // Compute bedtime deviation in minutes (positive = late, negative = early)
      let deviationMins: number | null = null;
      if (log.bedtime && log.targetBedtime) {
        const bedHour = log.bedtime.getUTCHours();
        const bedMin = log.bedtime.getUTCMinutes();
        const [tH, tM] = log.targetBedtime.split(":").map(Number);

        const actualMins = bedHour * 60 + bedMin;
        const targetMins = tH * 60 + tM;

        // Handle midnight wrap
        let diff = actualMins - targetMins;
        if (diff < -720) diff += 1440;
        if (diff > 720) diff -= 1440;

        deviationMins = diff;
      }

      // Next-day completion rate
      const nextDay = new Date(dateStr + "T12:00:00.000Z");
      nextDay.setDate(nextDay.getDate() + 1);
      const nextDayStr = nextDay.toISOString().slice(0, 10);
      const dayScheduled = scheduledByDay.get(nextDayStr) ?? 0;
      const dayCompleted = completionsByDay.get(nextDayStr) ?? 0;
      const nextDayCompletionRate = dayScheduled > 0
        ? Math.round((dayCompleted / dayScheduled) * 100)
        : null;

      daily.push({ date: dateStr, deviationMins, nextDayCompletionRate });
    }

    return {
      avgDurationMins,
      onTimeBedtimeRate,
      lateNightCompletionRate,
      onTimeCompletionRate,
      lateNightDays,
      onTimeNightDays,
      totalNights: sleepLogs.length,
      daily,
    };
  };

  const current = await computePeriod(start, end);
  const prior = priorStart && priorEnd
    ? await computePeriod(priorStart, priorEnd)
    : null;

  return NextResponse.json({ current, prior, window });
}
