import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api/auth-helpers";
import { buildDriftTaskFilter } from "@/lib/drift/filters";

export async function GET(req: NextRequest) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { driftDashboardEnabled: true, driftBreakdownThreshold: true },
  });
  if (!user?.driftDashboardEnabled) {
    return NextResponse.json({ error: "Drift dashboard disabled" }, { status: 403 });
  }

  const areaId = req.nextUrl.searchParams.get("areaId") ?? undefined;
  const goalId = req.nextUrl.searchParams.get("goalId") ?? undefined;
  const routineId = req.nextUrl.searchParams.get("routineId") ?? undefined;

  const driftFilter = buildDriftTaskFilter({ areaId, goalId, routineId });

  const tasks = await prisma.task.findMany({
    where: {
      userId,
      AND: [
        { OR: [{ deferralCount: { gt: 0 } }, { dueDatePushCount: { gt: 0 } }] },
        driftFilter,
      ],
    },
    select: {
      id: true,
      title: true,
      status: true,
      deferralCount: true,
      dueDatePushCount: true,
      totalDriftDays: true,
      originalDueDate: true,
      dueDate: true,
      project: {
        select: {
          id: true,
          title: true,
          area: { select: { id: true, name: true } },
        },
      },
      routine: {
        select: {
          id: true,
          title: true,
          area: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { deferralCount: "desc" },
    take: 50,
  });

  const result = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    area: t.project?.area?.name ?? t.routine?.area?.name ?? null,
    project: t.project?.title ?? null,
    routine: t.routine?.title ?? null,
    deferralCount: t.deferralCount,
    dueDatePushCount: t.dueDatePushCount,
    totalDriftDays: t.totalDriftDays,
    breakdownSignal: t.deferralCount >= user.driftBreakdownThreshold,
  }));

  return NextResponse.json({ tasks: result });
}
