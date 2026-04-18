import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api/auth-helpers";
import { scheduleLabel, getProgressionValue, formatProgression } from "@/lib/recurring";
import { getDayNumber, resolveDosage, getPreviousDosage } from "@/lib/routine-dosing";
import { sweepMissedRoutinesForUser } from "@/lib/services/recurring-missed-service";

/**
 * GET /api/tasks/card-file
 * Returns routine-linked tasks split by scheduledDate vs today for the Card File view.
 * Handles both simple routines (no windows) and windowed routines via a unified shape.
 */
export async function GET() {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  // Lazy per-user end-of-day sweep (replaces /api/cron/recurring-missed)
  await sweepMissedRoutinesForUser(userId);

  // Get user's timezone for correct day boundaries
  const prefs = await prisma.notificationPreference.findUnique({
    where: { userId },
    select: { timezone: true },
  });
  const timezone = prefs?.timezone || "America/New_York";

  const now = new Date();

  // Calculate today's boundaries using the user's local date
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const parts = formatter.formatToParts(now);
  const localYear = parseInt(parts.find((p) => p.type === "year")!.value);
  const localMonth = parseInt(parts.find((p) => p.type === "month")!.value) - 1;
  const localDay = parseInt(parts.find((p) => p.type === "day")!.value);

  const startOfToday = new Date(Date.UTC(localYear, localMonth, localDay));
  const endOfToday = new Date(startOfToday);
  endOfToday.setUTCDate(endOfToday.getUTCDate() + 1);

  // Get all active tasks linked to routines (simple + windowed)
  const tasks = await prisma.task.findMany({
    where: {
      userId,
      routineId: { not: null },
      status: { notIn: ["COMPLETED", "DROPPED"] },
    },
    include: {
      context: { select: { id: true, name: true, color: true } },
      project: { select: { id: true, title: true } },
      routine: {
        select: {
          id: true,
          cronExpression: true,
          color: true,
          estimatedMins: true,
          routineType: true,
          startDate: true,
          totalDays: true,
          // Simple routine fields
          skipStreak: true,
          targetTime: true,
          dueByTime: true,
          progressionBaseValue: true,
          progressionIncrement: true,
          progressionUnit: true,
          progressionFrequency: true,
          progressionStartDate: true,
          // Sleep tracker fields
          targetBedtime: true,
          targetWakeTime: true,
          windows: {
            orderBy: { sortOrder: "asc" },
            include: {
              items: { orderBy: { sortOrder: "asc" } },
            },
          },
        },
      },
    },
    orderBy: { scheduledDate: "asc" },
  });

  const overdue: typeof tasks = [];
  const today: typeof tasks = [];
  const upcoming: typeof tasks = [];

  for (const task of tasks) {
    const scheduled = task.scheduledDate;
    if (!scheduled || scheduled < startOfToday) {
      overdue.push(task);
    } else if (scheduled >= startOfToday && scheduled < endOfToday) {
      today.push(task);
    } else {
      upcoming.push(task);
    }
  }

  // Sort today's cards by targetTime (null sorts to end)
  today.sort((a, b) => {
    const aTime = a.routine?.targetTime
      ?? a.routine?.windows?.[0]?.targetTime
      ?? "23:59";
    const bTime = b.routine?.targetTime
      ?? b.routine?.windows?.[0]?.targetTime
      ?? "23:59";
    return aTime.localeCompare(bTime);
  });

  // Current time as HH:MM in user's timezone for overdue-within-day comparison
  const timeFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const timeParts = timeFmt.formatToParts(now);
  const nowHHMM = `${timeParts.find((p) => p.type === "hour")!.value}:${timeParts.find((p) => p.type === "minute")!.value}`;

  // Fetch today's routine logs for all windowed routine tasks in one query
  const routineIds = tasks
    .filter((t) => t.routineId && t.routine && t.routine.windows.length > 0)
    .map((t) => t.routineId!);
  const routineLogs = routineIds.length > 0
    ? await prisma.routineLog.findMany({
        where: {
          routineId: { in: routineIds },
          date: { gte: startOfToday, lt: endOfToday },
        },
      })
    : [];

  // Fetch today's sleep logs for all sleep routine tasks in one query
  const sleepRoutineIds = tasks
    .filter((t) => t.routineId && t.routine && t.routine.routineType === "sleep")
    .map((t) => t.routineId!);
  const sleepLogs = sleepRoutineIds.length > 0
    ? await prisma.sleepLog.findMany({
        where: {
          routineId: { in: sleepRoutineIds },
          date: { gte: startOfToday, lt: endOfToday },
        },
      })
    : [];

  const mapTask = (task: (typeof tasks)[number], { isUpcoming = false } = {}) => {
    const routine = task.routine;
    if (!routine) {
      return {
        id: task.id,
        title: task.title,
        notes: task.notes,
        status: task.status,
        scheduledDate: task.scheduledDate?.toISOString() ?? null,
        dueDate: task.dueDate?.toISOString() ?? null,
        estimatedMins: task.estimatedMins,
        energyLevel: task.energyLevel,
        version: task.version,
        context: task.context,
        project: task.project,
        isOverdueWithinDay: false,
        routine: null,
      };
    }

    const isSimple = routine.windows.length === 0;
    const isDynamic = routine.routineType === "dynamic" && routine.startDate;
    const taskDate = task.scheduledDate ?? new Date();
    const rawDayNumber = isDynamic ? getDayNumber(routine.startDate!, taskDate) : null;

    // If the day number is negative or zero, the routine hasn't started yet —
    // this task shouldn't exist (pre-fix leftover). Skip it.
    if (rawDayNumber != null && rawDayNumber < 1) {
      return null;
    }
    const dayNumber = rawDayNumber;

    // Build progression info for simple routines
    let progression = null;
    if (
      isSimple &&
      routine.progressionBaseValue != null &&
      routine.progressionIncrement != null &&
      routine.progressionUnit &&
      routine.progressionFrequency &&
      routine.progressionStartDate
    ) {
      const currentValue = getProgressionValue({
        baseValue: routine.progressionBaseValue!,
        increment: routine.progressionIncrement!,
        unit: routine.progressionUnit!,
        frequency: routine.progressionFrequency!,
        startDate: routine.progressionStartDate!,
      });
      progression = {
        currentValue,
        unit: routine.progressionUnit,
        label: formatProgression(
          currentValue,
          routine.progressionIncrement!,
          routine.progressionUnit!,
          routine.progressionFrequency!
        ),
      };
    }

    return {
      id: task.id,
      title: task.title,
      notes: task.notes,
      status: task.status,
      scheduledDate: task.scheduledDate?.toISOString() ?? null,
      dueDate: task.dueDate?.toISOString() ?? null,
      estimatedMins: task.estimatedMins ?? routine.estimatedMins ?? null,
      energyLevel: task.energyLevel,
      version: task.version,
      context: task.context,
      project: task.project,
      isOverdueWithinDay: !isUpcoming && routine.dueByTime
        ? nowHHMM > routine.dueByTime
        : false,
      routine: {
        id: routine.id,
        color: routine.color,
        estimatedMins: routine.estimatedMins,
        scheduleLabel: scheduleLabel(routine.cronExpression),
        routineType: routine.routineType,
        dayNumber,
        totalDays: routine.totalDays,
        // Simple routine fields
        skipStreak: routine.skipStreak,
        targetTime: routine.targetTime,
        dueByTime: routine.dueByTime,
        progression,
        // Sleep tracker fields
        targetBedtime: routine.targetBedtime,
        targetWakeTime: routine.targetWakeTime,
        sleepLog: routine.routineType === "sleep"
          ? (sleepLogs.find((l) => l.routineId === task.routineId) ?? null)
          : null,
        // Windows (empty array for simple routines)
        windows: routine.windows.map((w) => ({
          id: w.id,
          title: w.title,
          targetTime: w.targetTime,
          sortOrder: w.sortOrder,
          constraint: w.constraint,
          windowType: w.windowType,
          items: w.items.map((item) => {
            const resolvedDosage = dayNumber != null
              ? resolveDosage(item.dosage, item.rampSchedule, dayNumber)
              : item.dosage;
            const prevDosage = dayNumber != null
              ? getPreviousDosage(item.dosage, item.rampSchedule, dayNumber)
              : null;
            return {
              id: item.id,
              name: item.name,
              dosage: resolvedDosage,
              form: item.form,
              notes: item.notes,
              dosageChanged: prevDosage != null && prevDosage !== resolvedDosage,
            };
          }),
          log: routineLogs.find(
            (l) => l.routineId === task.routineId && l.windowId === w.id
          ) ?? null,
        })),
      },
    };
  };

  return NextResponse.json({
    overdue: overdue.map((t) => mapTask(t)).filter(Boolean),
    today: today.map((t) => mapTask(t)).filter(Boolean),
    upcoming: upcoming.map((t) => mapTask(t, { isUpcoming: true })).filter(Boolean),
  });
}
