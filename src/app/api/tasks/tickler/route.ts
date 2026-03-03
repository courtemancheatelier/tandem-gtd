import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/auth-helpers";
import { getTickleredTasks, getDueToday } from "@/lib/tickler";

/**
 * GET /api/tasks/tickler
 *
 * Returns tasks with a future scheduledDate, grouped by date, plus tasks
 * whose scheduledDate is today (just became active).
 *
 * Query params:
 *   - limit  (number, default 50)  — max tasks to return in the deferred list
 *   - before (ISO date string)     — cursor for pagination; only return tasks
 *                                     with scheduledDate before this value
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { searchParams } = new URL(req.url);
  const limit = searchParams.get("limit")
    ? parseInt(searchParams.get("limit")!, 10)
    : 50;
  const before = searchParams.get("before") ?? undefined;

  const [deferred, dueToday] = await Promise.all([
    getTickleredTasks(userId, { limit, before }),
    getDueToday(userId),
  ]);

  // Group deferred tasks by date (YYYY-MM-DD)
  const grouped: Record<
    string,
    Array<(typeof deferred)[number]>
  > = {};

  for (const task of deferred) {
    if (!task.scheduledDate) continue;
    const dateKey = task.scheduledDate.toISOString().split("T")[0];
    if (!grouped[dateKey]) grouped[dateKey] = [];
    grouped[dateKey].push(task);
  }

  // Sort groups chronologically
  const sortedGroups = Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, tasks]) => ({ date, tasks }));

  return NextResponse.json({
    dueToday,
    deferred: sortedGroups,
    totalDeferred: deferred.length,
    hasMore: deferred.length === limit,
  });
}
