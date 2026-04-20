import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api/auth-helpers";
import { computeWindowRange, DriftWindow } from "@/lib/drift/windows";
import { buildDriftTaskFilter } from "@/lib/drift/filters";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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
  const { start, end } = computeWindowRange(window);

  const events = await prisma.taskEvent.findMany({
    where: {
      eventType: "COMPLETED",
      createdAt: { gte: start, lte: end },
      task: {
        userId,
        ...buildDriftTaskFilter({ areaId, goalId, routineId }),
      },
    },
    select: { createdAt: true },
  });

  // Determine grouping mode based on window
  const isMonthly = window === "this-month";
  const isYTD = window === "ytd";

  if (isYTD) {
    // Group by (month, 2-hour block)
    const grid = new Map<string, number>();
    for (const e of events) {
      const d = e.createdAt;
      const monthLabel = MONTH_LABELS[d.getMonth()];
      const hour = Math.floor(d.getHours() / 2) * 2;
      const key = `${monthLabel}:${hour}`;
      grid.set(key, (grid.get(key) ?? 0) + 1);
    }

    const currentMonth = new Date().getMonth();
    const rowLabels = MONTH_LABELS.slice(0, currentMonth + 1);
    const cells: { dayLabel: string; hour: number; completions: number }[] = [];
    for (const label of rowLabels) {
      for (let hour = 0; hour < 24; hour += 2) {
        cells.push({
          dayLabel: label,
          hour,
          completions: grid.get(`${label}:${hour}`) ?? 0,
        });
      }
    }

    return NextResponse.json({ cells, window, mode: "months" as const, rowLabels });
  }

  if (isMonthly) {
    // Group by (date, 2-hour block)
    const grid = new Map<string, number>();
    for (const e of events) {
      const d = e.createdAt;
      const dateLabel = `${d.getMonth() + 1}/${d.getDate()}`;
      const hour = Math.floor(d.getHours() / 2) * 2;
      const key = `${dateLabel}:${hour}`;
      grid.set(key, (grid.get(key) ?? 0) + 1);
    }

    // Build row labels for every day in the month
    const rowLabels: string[] = [];
    const cursor = new Date(start);
    const now = new Date();
    while (cursor <= end && cursor <= now) {
      rowLabels.push(`${cursor.getMonth() + 1}/${cursor.getDate()}`);
      cursor.setDate(cursor.getDate() + 1);
    }

    const cells: { dayLabel: string; hour: number; completions: number }[] = [];
    for (const label of rowLabels) {
      for (let hour = 0; hour < 24; hour += 2) {
        cells.push({
          dayLabel: label,
          hour,
          completions: grid.get(`${label}:${hour}`) ?? 0,
        });
      }
    }

    return NextResponse.json({ cells, window, mode: "days" as const, rowLabels });
  }

  // Weekly views: group by (dayOfWeek, 2-hour block)
  const grid = new Map<string, number>();
  for (const e of events) {
    const d = e.createdAt;
    const isoDay = d.getDay() === 0 ? 6 : d.getDay() - 1;
    const dayLabel = DAY_LABELS[isoDay];
    const hour = Math.floor(d.getHours() / 2) * 2;
    const key = `${dayLabel}:${hour}`;
    grid.set(key, (grid.get(key) ?? 0) + 1);
  }

  const cells: { dayLabel: string; hour: number; completions: number }[] = [];
  for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
    for (let hour = 0; hour < 24; hour += 2) {
      const key = `${DAY_LABELS[dayIdx]}:${hour}`;
      cells.push({
        dayLabel: DAY_LABELS[dayIdx],
        hour,
        completions: grid.get(key) ?? 0,
      });
    }
  }

  return NextResponse.json({ cells, window, mode: "weekdays" as const, rowLabels: DAY_LABELS });
}
