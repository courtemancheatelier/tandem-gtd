import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api/auth-helpers";
import { computeWindowRange, DriftWindow } from "@/lib/drift/windows";
import { buildDriftTaskFilter } from "@/lib/drift/filters";

/**
 * GET /api/insights/drift/deferrals?window=this-week
 *
 * Scope: tasks whose scheduledDate OR dueDate falls within the window, are
 * not completed, and were deferred at least once (deferralCount > 0) or
 * dropped — i.e. commitments made for this window that slipped.
 *
 * This anchors on the commitment date so the total matches Outcome Summary's
 * "Skipped / Deferred" count. Tasks are counted once regardless of how many
 * times they were deferred (issue #40).
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

  async function getDeferrals(from: Date, to: Date) {
    const tasks = await prisma.task.findMany({
      where: {
        userId,
        status: { not: "COMPLETED" },
        OR: [{ deferralCount: { gt: 0 } }, { status: "DROPPED" }],
        AND: [
          { OR: [{ scheduledDate: { gte: from, lte: to } }, { dueDate: { gte: from, lte: to } }] },
          driftFilter,
        ],
      },
      select: { scheduledDate: true, dueDate: true },
    });

    const map = new Map<string, number>();
    for (const t of tasks) {
      const commitment = t.scheduledDate ?? t.dueDate;
      if (!commitment) continue;
      const day = commitment.toISOString().slice(0, 10);
      map.set(day, (map.get(day) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));
  }

  const current = await getDeferrals(start, end);
  const prior = priorStart && priorEnd ? await getDeferrals(priorStart, priorEnd) : [];

  return NextResponse.json({ current, prior, window });
}
