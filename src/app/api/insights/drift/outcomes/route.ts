import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api/auth-helpers";
import { computeWindowRange, DriftWindow } from "@/lib/drift/windows";
import { buildDriftTaskFilter } from "@/lib/drift/filters";

/**
 * GET /api/insights/drift/outcomes?window=this-week
 *
 * Returns three-category outcome breakdown for tasks that had a
 * scheduledDate or dueDate within the selected window:
 *
 * 1. Completed — tasks marked COMPLETED
 * 2. Skipped/Deferred — tasks with deferral or skip events (conscious choice)
 * 3. Expired Untouched — tasks whose date passed with zero user interaction
 */
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
  const areaId = req.nextUrl.searchParams.get("areaId") ?? undefined;
  const goalId = req.nextUrl.searchParams.get("goalId") ?? undefined;
  const routineId = req.nextUrl.searchParams.get("routineId") ?? undefined;
  const { start, end, priorStart, priorEnd } = computeWindowRange(window);

  const driftFilter = buildDriftTaskFilter({ areaId, goalId, routineId });

  async function getOutcomes(from: Date, to: Date) {
    // All tasks that were scheduled/due within this window
    const tasks = await prisma.task.findMany({
      where: {
        userId,
        AND: [
          { OR: [{ scheduledDate: { gte: from, lte: to } }, { dueDate: { gte: from, lte: to } }] },
          driftFilter,
        ],
      },
      select: {
        id: true,
        title: true,
        status: true,
        deferralCount: true,
        scheduledDate: true,
        dueDate: true,
        completedAt: true,
        project: {
          select: {
            area: { select: { id: true, name: true } },
          },
        },
        routine: {
          select: {
            area: { select: { id: true, name: true } },
          },
        },
      },
    });

    let completed = 0;
    let skippedDeferred = 0;
    let expiredUntouched = 0;
    const expiredTasks: {
      id: string;
      title: string;
      area: string | null;
      scheduledDate: string | null;
      dueDate: string | null;
    }[] = [];

    for (const task of tasks) {
      if (task.status === "COMPLETED") {
        completed++;
      } else if (task.deferralCount > 0 || task.status === "DROPPED") {
        skippedDeferred++;
      } else if (task.status === "NOT_STARTED" || task.status === "IN_PROGRESS") {
        // Task is still open — check if its date has passed
        const relevantDate = task.scheduledDate ?? task.dueDate;
        if (relevantDate && relevantDate < new Date()) {
          expiredUntouched++;
          expiredTasks.push({
            id: task.id,
            title: task.title,
            area: task.project?.area?.name ?? task.routine?.area?.name ?? null,
            scheduledDate: task.scheduledDate?.toISOString().slice(0, 10) ?? null,
            dueDate: task.dueDate?.toISOString().slice(0, 10) ?? null,
          });
        }
      }
    }

    return { completed, skippedDeferred, expiredUntouched, expiredTasks };
  }

  const current = await getOutcomes(start, end);
  const prior = priorStart && priorEnd
    ? await getOutcomes(priorStart, priorEnd)
    : null;

  return NextResponse.json({ current, prior, window });
}
