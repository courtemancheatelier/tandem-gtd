import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest } from "@/lib/api/auth-helpers";

/**
 * GET /api/calendar/review?direction=past|upcoming
 *
 * Returns calendar events grouped by date for weekly review.
 * - past: last 7 days (including external events)
 * - upcoming: next 14 days (including external events)
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const direction = new URL(req.url).searchParams.get("direction");
  if (direction !== "past" && direction !== "upcoming") {
    return badRequest("direction must be 'past' or 'upcoming'");
  }

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  let startDate: Date;
  let endDate: Date;

  if (direction === "past") {
    startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 7);
    endDate = new Date(now);
    endDate.setHours(23, 59, 59, 999);
  } else {
    startDate = new Date(now);
    endDate = new Date(now);
    endDate.setDate(endDate.getDate() + 14);
    endDate.setHours(23, 59, 59, 999);
  }

  const events = await prisma.calendarEvent.findMany({
    where: {
      userId,
      date: { gte: startDate, lte: endDate },
      recurringEventId: null,
    },
    include: {
      task: { select: { id: true, title: true } },
      project: { select: { id: true, title: true } },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });

  // Group events by date
  const grouped: Record<string, typeof events> = {};
  for (const event of events) {
    const dateKey = event.date.toISOString().slice(0, 10);
    if (!grouped[dateKey]) grouped[dateKey] = [];
    grouped[dateKey].push(event);
  }

  // Convert to sorted array of { date, events }
  const result = Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, evts]) => ({ date, events: evts }));

  return NextResponse.json(result);
}
