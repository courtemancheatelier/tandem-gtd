import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound, badRequest } from "@/lib/api/auth-helpers";
import { z } from "zod";
import { completeTask } from "@/lib/services/task-service";

const sleepLogSchema = z.object({
  date: z.string(), // YYYY-MM-DD (the evening date)
  action: z.enum(["bed", "wake"]),
});

/**
 * Compare a timestamp against a target time (HH:MM) to determine if it's on time.
 * For bedtime: on time means the actual time is at or before the target.
 * For wake: on time means the actual time is at or before the target.
 */
function isOnTime(
  actual: Date,
  targetHHMM: string,
  timezone: string,
  type: "bed" | "wake"
): boolean {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(actual);
  const actualHour = parseInt(parts.find((p) => p.type === "hour")!.value);
  const actualMin = parseInt(parts.find((p) => p.type === "minute")!.value);

  const [targetHour, targetMin] = targetHHMM.split(":").map(Number);

  const actualMins = actualHour * 60 + actualMin;
  const targetMins = targetHour * 60 + targetMin;

  if (type === "bed") {
    // Bedtime: on time if actual <= target
    // Handle wrap-around: if target is 23:00, going to bed at 22:45 is on time,
    // but going to bed at 23:30 is late. If someone goes to bed at 01:00, that's late.
    // Simple: if actual is within 6 hours before target, it's on time.
    // If actual is after target (up to 6 hours), it's late.
    const diff = actualMins - targetMins;
    if (diff <= 0 && diff > -360) return true; // up to 6 hours early
    if (diff > 0 && diff < 360) return false; // up to 6 hours late
    // Edge case: wrapped around midnight
    const wrappedDiff = (actualMins + 1440 - targetMins) % 1440;
    return wrappedDiff > 720; // more than 12 hours means early
  } else {
    // Wake: on time if actual <= target
    return actualMins <= targetMins;
  }
}

/** POST /api/routines/:id/sleep-log — log bedtime or wake time */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const routine = await prisma.routine.findFirst({
    where: { id: params.id, userId, routineType: "sleep" },
  });
  if (!routine) return notFound("Sleep routine not found");

  const body = await req.json();
  const parsed = sleepLogSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.message);
  const { date, action } = parsed.data;

  // Get user timezone
  const prefs = await prisma.notificationPreference.findUnique({
    where: { userId },
    select: { timezone: true },
  });
  const timezone = prefs?.timezone || "America/New_York";

  const dateObj = new Date(date + "T00:00:00.000Z");
  const now = new Date();

  if (action === "bed") {
    const onTime = routine.targetBedtime
      ? isOnTime(now, routine.targetBedtime, timezone, "bed")
      : null;

    const sleepLog = await prisma.sleepLog.upsert({
      where: {
        routineId_date: { routineId: params.id, date: dateObj },
      },
      create: {
        routineId: params.id,
        userId,
        date: dateObj,
        bedtime: now,
        targetBedtime: routine.targetBedtime,
        targetWakeTime: routine.targetWakeTime,
        bedtimeOnTime: onTime,
      },
      update: {
        bedtime: now,
        bedtimeOnTime: onTime,
      },
    });

    return NextResponse.json({ sleepLog });
  }

  if (action === "wake") {
    // Find existing sleep log for this date
    const existing = await prisma.sleepLog.findUnique({
      where: {
        routineId_date: { routineId: params.id, date: dateObj },
      },
    });

    if (!existing || !existing.bedtime) {
      return badRequest("Must log bedtime before wake time");
    }

    const onTime = routine.targetWakeTime
      ? isOnTime(now, routine.targetWakeTime, timezone, "wake")
      : null;

    const durationMins = Math.round(
      (now.getTime() - existing.bedtime.getTime()) / 60000
    );

    const sleepLog = await prisma.sleepLog.update({
      where: { id: existing.id },
      data: {
        wakeTime: now,
        wakeOnTime: onTime,
        durationMins,
        targetWakeTime: routine.targetWakeTime,
      },
    });

    // Auto-complete the linked task for this date
    const startOfDay = dateObj;
    const endOfDay = new Date(dateObj);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const tasksToComplete = await prisma.task.findMany({
      where: {
        routineId: params.id,
        userId,
        status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
        scheduledDate: { gte: startOfDay, lt: endOfDay },
      },
      select: { id: true },
    });

    for (const t of tasksToComplete) {
      try {
        await completeTask(t.id, userId, {
          actorType: "USER",
          actorId: userId,
          source: "MANUAL",
        });
      } catch {
        // Task may already be completed — continue
      }
    }

    return NextResponse.json({ sleepLog, taskCompleted: tasksToComplete.length > 0 });
  }

  return badRequest("Invalid action");
}

const editSchema = z.object({
  date: z.string(), // YYYY-MM-DD
  bedtime: z.string().nullable().optional(), // ISO timestamp or HH:MM
  wakeTime: z.string().nullable().optional(), // ISO timestamp or HH:MM
});

/** Parse a time string — accepts "HH:MM" (builds DateTime from date) or full ISO */
function parseTimeInput(input: string, dateStr: string): Date {
  // If it looks like HH:MM, build a full timestamp
  if (/^\d{2}:\d{2}$/.test(input)) {
    const [h, m] = input.split(":").map(Number);
    // If hour < 12, assume it's the next morning (wake time)
    // If hour >= 12, assume it's the evening of the date
    const d = new Date(dateStr + "T00:00:00.000Z");
    if (h < 12) {
      // Next day (morning)
      d.setDate(d.getDate() + 1);
    }
    d.setUTCHours(h, m, 0, 0);
    return d;
  }
  return new Date(input);
}

/** PATCH /api/routines/:id/sleep-log — edit bedtime/wake time manually */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("PATCH");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const routine = await prisma.routine.findFirst({
    where: { id: params.id, userId, routineType: "sleep" },
  });
  if (!routine) return notFound("Sleep routine not found");

  const body = await req.json();
  const parsed = editSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.message);
  const { date, bedtime, wakeTime } = parsed.data;

  const prefs = await prisma.notificationPreference.findUnique({
    where: { userId },
    select: { timezone: true },
  });
  const timezone = prefs?.timezone || "America/New_York";

  const dateObj = new Date(date + "T00:00:00.000Z");

  const bedtimeDate = bedtime ? parseTimeInput(bedtime, date) : undefined;
  const wakeTimeDate = wakeTime ? parseTimeInput(wakeTime, date) : undefined;

  // Compute on-time flags
  const bedtimeOnTime = bedtimeDate && routine.targetBedtime
    ? isOnTime(bedtimeDate, routine.targetBedtime, timezone, "bed")
    : undefined;
  const wakeOnTime = wakeTimeDate && routine.targetWakeTime
    ? isOnTime(wakeTimeDate, routine.targetWakeTime, timezone, "wake")
    : undefined;

  // Get existing log to compute duration
  const existing = await prisma.sleepLog.findUnique({
    where: { routineId_date: { routineId: params.id, date: dateObj } },
  });

  const finalBedtime = bedtimeDate ?? existing?.bedtime ?? null;
  const finalWakeTime = wakeTimeDate ?? existing?.wakeTime ?? null;
  const durationMins = finalBedtime && finalWakeTime
    ? Math.round((finalWakeTime.getTime() - finalBedtime.getTime()) / 60000)
    : undefined;

  const sleepLog = await prisma.sleepLog.upsert({
    where: { routineId_date: { routineId: params.id, date: dateObj } },
    create: {
      routineId: params.id,
      userId,
      date: dateObj,
      bedtime: finalBedtime,
      wakeTime: finalWakeTime,
      targetBedtime: routine.targetBedtime,
      targetWakeTime: routine.targetWakeTime,
      bedtimeOnTime: bedtimeOnTime ?? null,
      wakeOnTime: wakeOnTime ?? null,
      durationMins: durationMins ?? null,
    },
    update: {
      ...(bedtimeDate !== undefined ? { bedtime: bedtimeDate, bedtimeOnTime: bedtimeOnTime ?? null } : {}),
      ...(wakeTimeDate !== undefined ? { wakeTime: wakeTimeDate, wakeOnTime: wakeOnTime ?? null } : {}),
      ...(durationMins !== undefined ? { durationMins } : {}),
    },
  });

  // If both times are now set and task hasn't been completed, auto-complete
  if (sleepLog.bedtime && sleepLog.wakeTime) {
    const startOfDay = dateObj;
    const endOfDay = new Date(dateObj);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const tasksToComplete = await prisma.task.findMany({
      where: {
        routineId: params.id,
        userId,
        status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
        scheduledDate: { gte: startOfDay, lt: endOfDay },
      },
      select: { id: true },
    });

    for (const t of tasksToComplete) {
      try {
        await completeTask(t.id, userId, {
          actorType: "USER",
          actorId: userId,
          source: "MANUAL",
        });
      } catch {
        // continue
      }
    }
  }

  return NextResponse.json({ sleepLog });
}

/** GET /api/routines/:id/sleep-log — fetch sleep logs for a date or range */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const routine = await prisma.routine.findFirst({
    where: { id: params.id, userId },
  });
  if (!routine) return notFound("Routine not found");

  const url = new URL(req.url);
  const date = url.searchParams.get("date");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if (date) {
    const dateObj = new Date(date + "T00:00:00.000Z");
    const log = await prisma.sleepLog.findUnique({
      where: {
        routineId_date: { routineId: params.id, date: dateObj },
      },
    });
    return NextResponse.json({ sleepLog: log });
  }

  if (from && to) {
    const fromDate = new Date(from + "T00:00:00.000Z");
    const toDate = new Date(to + "T23:59:59.999Z");
    const logs = await prisma.sleepLog.findMany({
      where: {
        routineId: params.id,
        date: { gte: fromDate, lte: toDate },
      },
      orderBy: { date: "desc" },
    });
    return NextResponse.json({ sleepLogs: logs });
  }

  // Default: last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const logs = await prisma.sleepLog.findMany({
    where: {
      routineId: params.id,
      date: { gte: thirtyDaysAgo },
    },
    orderBy: { date: "desc" },
  });
  return NextResponse.json({ sleepLogs: logs });
}
