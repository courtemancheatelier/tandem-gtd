import { prisma } from "@/lib/prisma";
import { getLocalDateParts, recycleRecurringTask } from "@/lib/recurring";
import { getDayNumber } from "@/lib/routine-dosing";

export interface SweepResult {
  skipped: boolean;
  simpleMissed: number;
  windowedMissed: number;
}

/**
 * Sweep this user's overdue routine tasks and mark them missed.
 *
 * Lazy per-user replacement for the legacy `/api/cron/recurring-missed`
 * external cron. Runs at most once per user per local day, gated by
 * `User.lastMissedSweepAt`. Safe and cheap to call unconditionally at the
 * top of any handler that touches routine state.
 *
 * Pass `force: true` to bypass the gate (used by the legacy cron route
 * during the transition period).
 */
export async function sweepMissedRoutinesForUser(
  userId: string,
  opts: { force?: boolean } = {}
): Promise<SweepResult> {
  const noop: SweepResult = { skipped: true, simpleMissed: 0, windowedMissed: 0 };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      lastMissedSweepAt: true,
      notificationPreference: { select: { timezone: true } },
    },
  });
  if (!user) return noop;

  const timezone = user.notificationPreference?.timezone || "America/New_York";
  const now = new Date();
  const localParts = getLocalDateParts(now, timezone);
  const startOfLocalToday = new Date(Date.UTC(localParts.year, localParts.month, localParts.day));

  if (
    !opts.force &&
    user.lastMissedSweepAt &&
    user.lastMissedSweepAt >= startOfLocalToday
  ) {
    return noop;
  }

  const tasks = await prisma.task.findMany({
    where: {
      userId,
      routineId: { not: null },
      status: { notIn: ["COMPLETED", "DROPPED"] },
      scheduledDate: { lt: startOfLocalToday },
    },
    include: {
      routine: {
        select: {
          id: true,
          routineType: true,
          startDate: true,
          windows: { select: { id: true } },
        },
      },
    },
  });

  let simpleMissed = 0;
  let windowedMissed = 0;

  for (const task of tasks) {
    if (!task.routineId || !task.scheduledDate || !task.routine) continue;

    const isSimple = task.routine.windows.length === 0;

    if (isSimple) {
      await prisma.task.update({
        where: { id: task.id },
        data: {
          status: "DROPPED",
          isNextAction: false,
          version: { increment: 1 },
        },
      });

      await prisma.taskEvent.create({
        data: {
          taskId: task.id,
          eventType: "STATUS_CHANGED",
          actorType: "SYSTEM",
          changes: {
            status: { old: task.status, new: "DROPPED" },
            reason: "MISSED",
          },
          source: "SCHEDULER",
          message: "Missed recurring task (end-of-day)",
        },
      });

      await prisma.routine.update({
        where: { id: task.routineId },
        data: { skipStreak: { increment: 1 } },
      });

      await recycleRecurringTask(task.routineId);

      simpleMissed++;
    } else {
      const routine = await prisma.routine.findUnique({
        where: { id: task.routineId },
        include: { windows: true },
      });

      if (routine) {
        const taskDate = task.scheduledDate;
        const dayStart = new Date(
          Date.UTC(taskDate.getUTCFullYear(), taskDate.getUTCMonth(), taskDate.getUTCDate())
        );

        for (const window of routine.windows) {
          const dayNum =
            routine.routineType === "dynamic" && routine.startDate
              ? getDayNumber(routine.startDate, dayStart)
              : null;

          try {
            await prisma.routineLog.upsert({
              where: {
                routineId_windowId_date: {
                  routineId: routine.id,
                  windowId: window.id,
                  date: dayStart,
                },
              },
              update: {},
              create: {
                routineId: routine.id,
                windowId: window.id,
                date: dayStart,
                dayNumber: dayNum,
                status: "missed",
                userId: task.userId,
              },
            });
          } catch {
            // Concurrent sweep created the row first — safe to ignore.
          }
        }
      }

      await prisma.task.update({
        where: { id: task.id },
        data: { status: "DROPPED", isNextAction: false, version: { increment: 1 } },
      });

      await prisma.taskEvent.create({
        data: {
          taskId: task.id,
          eventType: "STATUS_CHANGED",
          actorType: "SYSTEM",
          changes: { status: { old: task.status, new: "DROPPED" }, reason: "MISSED" },
          source: "SCHEDULER",
          message: "Missed routine task (end-of-day)",
        },
      });

      windowedMissed++;
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: { lastMissedSweepAt: now },
  });

  return { skipped: false, simpleMissed, windowedMissed };
}
