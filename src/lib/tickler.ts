import { prisma } from "@/lib/prisma";
import { TaskStatus } from "@prisma/client";

/**
 * Tickler / Defer Dates helper functions.
 *
 * In GTD, a "tickler file" holds items that shouldn't surface until a future
 * date.  Tasks with a `scheduledDate` in the future are considered "ticklered"
 * and are excluded from the Do Now view.  Once the date arrives, the task
 * automatically becomes available.
 */

// ---------------------------------------------------------------------------
// Date helpers (all comparisons use start-of-day in local time)
// ---------------------------------------------------------------------------

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

// ---------------------------------------------------------------------------
// Pure helpers (no DB access)
// ---------------------------------------------------------------------------

/**
 * Returns `true` if the task's `scheduledDate` is strictly in the future
 * (i.e. beyond the end of today).
 */
export function isTicklered(task: { scheduledDate?: Date | string | null }): boolean {
  if (!task.scheduledDate) return false;
  const scheduled = new Date(task.scheduledDate);
  const todayEnd = endOfDay(new Date());
  return scheduled > todayEnd;
}

/**
 * Returns a Prisma `where` clause fragment that either includes or excludes
 * deferred (ticklered) tasks.
 *
 * - `includeDeferred: true`  -> no scheduledDate filter (returns all tasks)
 * - `includeDeferred: false` -> only tasks with no scheduledDate or
 *   scheduledDate <= now (the same logic used by `/api/tasks/available`)
 */
export function ticklerWhere(includeDeferred: boolean): Record<string, unknown> {
  if (includeDeferred) return {};

  const now = new Date();
  return {
    OR: [
      { scheduledDate: null },
      { scheduledDate: { lte: now } },
    ],
  };
}

// ---------------------------------------------------------------------------
// Prisma queries
// ---------------------------------------------------------------------------

/** Shared include clause used across tickler queries. */
const taskInclude = {
  project: { select: { id: true, title: true, type: true } },
  context: { select: { id: true, name: true, color: true } },
} as const;

/**
 * Fetch all tasks whose `scheduledDate` is strictly in the future for the
 * given user.  Results are ordered by `scheduledDate ASC` (soonest first).
 *
 * Supports cursor-based pagination via `before` (ISO date string) and `limit`.
 */
export async function getTickleredTasks(
  userId: string,
  options?: { limit?: number; before?: string }
) {
  const now = new Date();
  const limit = options?.limit ?? 50;

  const where: Record<string, unknown> = {
    userId,
    status: { in: [TaskStatus.NOT_STARTED, TaskStatus.IN_PROGRESS] },
    scheduledDate: {
      gt: endOfDay(now),
      ...(options?.before ? { lt: new Date(options.before) } : {}),
    },
  };

  return prisma.task.findMany({
    where,
    include: taskInclude,
    orderBy: { scheduledDate: "asc" },
    take: limit,
  });
}

/**
 * Fetch tasks whose `scheduledDate` falls on today -- these are items that
 * have "just become active" and should be surfaced to the user.
 */
export async function getDueToday(userId: string) {
  const today = new Date();
  const dayStart = startOfDay(today);
  const dayEnd = endOfDay(today);

  return prisma.task.findMany({
    where: {
      userId,
      status: { in: [TaskStatus.NOT_STARTED, TaskStatus.IN_PROGRESS] },
      scheduledDate: {
        gte: dayStart,
        lte: dayEnd,
      },
    },
    include: taskInclude,
    orderBy: { scheduledDate: "asc" },
  });
}
