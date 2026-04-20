import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api/auth-helpers";
import { generateTaskFromTemplate, getNextOccurrence, getLocalDateParts } from "@/lib/recurring";
import { getDayNumber, resolveDosage, isRoutineComplete } from "@/lib/routine-dosing";
import { sweepMissedRoutinesForUser } from "@/lib/services/recurring-missed-service";

/**
 * POST /api/routines/generate
 * User-triggered generation of today's routine cards.
 * Runs the same logic as the cron job but scoped to the authenticated user.
 */
export async function POST() {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  // Lazy per-user end-of-day sweep (replaces /api/cron/recurring-missed)
  await sweepMissedRoutinesForUser(userId);

  const now = new Date();

  const prefs = await prisma.notificationPreference.findUnique({
    where: { userId },
    select: { timezone: true },
  });
  const timezone = prefs?.timezone || "America/New_York";

  const routines = await prisma.routine.findMany({
    where: {
      userId,
      isActive: true,
      nextDue: { lte: now },
    },
    include: {
      windows: {
        orderBy: { sortOrder: "asc" },
        include: { items: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });

  let simpleGenerated = 0;
  let simpleSkipped = 0;
  let windowedGenerated = 0;
  let windowedSkipped = 0;

  for (const routine of routines) {
    const isSimple = routine.windows.length === 0;

    if (isSimple) {
      // ── Simple routine ──────────────────────────────────────────────
      const existingActive = await prisma.task.findFirst({
        where: {
          routineId: routine.id,
          status: { notIn: ["COMPLETED", "DROPPED"] },
        },
      });

      if (existingActive) {
        simpleSkipped++;
        continue;
      }

      if (routine.nextDue) {
        const scheduledStart = new Date(routine.nextDue);
        scheduledStart.setUTCHours(0, 0, 0, 0);
        const scheduledEnd = new Date(scheduledStart);
        scheduledEnd.setUTCDate(scheduledEnd.getUTCDate() + 1);
        const existingForDate = await prisma.task.findFirst({
          where: {
            routineId: routine.id,
            scheduledDate: { gte: scheduledStart, lt: scheduledEnd },
          },
        });
        if (existingForDate) {
          const nextDue = getNextOccurrence(routine.cronExpression, now, timezone);
          await prisma.routine.update({
            where: { id: routine.id },
            data: { nextDue },
          });
          simpleSkipped++;
          continue;
        }
      }

      await generateTaskFromTemplate({
        id: routine.id,
        userId: routine.userId,
        title: routine.title,
        description: routine.description,
        cronExpression: routine.cronExpression,
        taskDefaults: routine.taskDefaults as Record<string, unknown> | null,
        nextDue: routine.nextDue,
        isActive: routine.isActive,
        lastGenerated: routine.lastGenerated,
        progressionBaseValue: routine.progressionBaseValue,
        progressionIncrement: routine.progressionIncrement,
        progressionUnit: routine.progressionUnit,
        progressionFrequency: routine.progressionFrequency,
        progressionStartDate: routine.progressionStartDate,
      });

      const nextDue = getNextOccurrence(routine.cronExpression, now, timezone);
      await prisma.routine.update({
        where: { id: routine.id },
        data: { lastGenerated: now, nextDue },
      });

      simpleGenerated++;
    } else {
      // ── Windowed routine ────────────────────────────────────────────
      if (routine.routineType === "dynamic" && routine.startDate) {
        if (routine.startDate > now) {
          windowedSkipped++;
          continue;
        }
        if (routine.totalDays && isRoutineComplete(routine.startDate, routine.totalDays, now)) {
          await prisma.routine.update({
            where: { id: routine.id },
            data: { isActive: false },
          });
          windowedSkipped++;
          continue;
        }
      }

      const localParts = getLocalDateParts(now, timezone);
      const startOfLocalToday = new Date(Date.UTC(localParts.year, localParts.month, localParts.day));
      const endOfLocalToday = new Date(startOfLocalToday);
      endOfLocalToday.setUTCDate(endOfLocalToday.getUTCDate() + 1);

      const existingActive = await prisma.task.findFirst({
        where: {
          routineId: routine.id,
          status: { notIn: ["COMPLETED", "DROPPED"] },
        },
      });

      if (existingActive) {
        const scheduled = existingActive.scheduledDate;
        if (scheduled && scheduled >= startOfLocalToday && scheduled < endOfLocalToday) {
          windowedSkipped++;
          continue;
        }

        await prisma.task.update({
          where: { id: existingActive.id },
          data: { status: "DROPPED", isNextAction: false, version: { increment: 1 } },
        });

        await prisma.taskEvent.create({
          data: {
            taskId: existingActive.id,
            eventType: "STATUS_CHANGED",
            actorType: "SYSTEM",
            changes: { status: { old: existingActive.status, new: "DROPPED" }, reason: "MISSED" },
            source: "SCHEDULER",
            message: "Missed routine task (superseded by new day)",
          },
        });
      }

      if (routine.nextDue) {
        const existingForDate = await prisma.task.findFirst({
          where: {
            routineId: routine.id,
            scheduledDate: { gte: startOfLocalToday, lt: endOfLocalToday },
          },
        });
        if (existingForDate) {
          const nextDue = getNextOccurrence(routine.cronExpression, now, timezone);
          await prisma.routine.update({
            where: { id: routine.id },
            data: { nextDue },
          });
          windowedSkipped++;
          continue;
        }
      }

      const effectiveDate = routine.nextDue && routine.nextDue >= startOfLocalToday
        ? routine.nextDue
        : startOfLocalToday;

      const dayNumber =
        routine.routineType === "dynamic" && routine.startDate
          ? getDayNumber(routine.startDate, effectiveDate)
          : null;

      const taskTitle =
        dayNumber != null && routine.totalDays
          ? `${routine.title} (Day ${dayNumber} of ${routine.totalDays})`
          : routine.title;

      const noteLines: string[] = [];
      for (const w of routine.windows) {
        noteLines.push(`## ${w.title}${w.targetTime ? ` (${w.targetTime})` : ""}`);
        for (const item of w.items) {
          const dosage =
            dayNumber != null
              ? resolveDosage(item.dosage, item.rampSchedule, dayNumber)
              : item.dosage;
          noteLines.push(`- ${item.name}${dosage ? ` — ${dosage}` : ""}`);
        }
        noteLines.push("");
      }

      await prisma.task.create({
        data: {
          title: taskTitle,
          notes: noteLines.join("\n").trim(),
          userId: routine.userId,
          routineId: routine.id,
          scheduledDate: effectiveDate,
          estimatedMins: routine.estimatedMins,
          isNextAction: true,
          status: "NOT_STARTED",
        },
      });

      const nextDue = getNextOccurrence(routine.cronExpression, now, timezone);
      await prisma.routine.update({
        where: { id: routine.id },
        data: { lastGenerated: now, nextDue },
      });

      windowedGenerated++;
    }
  }

  const totalGenerated = simpleGenerated + windowedGenerated;

  return NextResponse.json({
    generated: totalGenerated,
    simple: { generated: simpleGenerated, skipped: simpleSkipped },
    windowed: { generated: windowedGenerated, skipped: windowedSkipped },
  });
}
