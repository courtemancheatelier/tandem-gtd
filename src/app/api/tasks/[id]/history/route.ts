import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound } from "@/lib/api/auth-helpers";
import { getUserTeamIds } from "@/lib/services/team-permissions";

const TIMER_SESSION_EVENT_TYPE = "TIMER_SESSION";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  // Verify task belongs to user or team
  const teamIds = await getUserTeamIds(userId);
  const task = await prisma.task.findFirst({
    where: {
      id: params.id,
      OR: [
        { userId },
        ...(teamIds.length > 0 ? [{ project: { teamId: { in: teamIds } } }] : []),
      ],
    },
    select: { id: true, title: true },
  });
  if (!task) return notFound("Task not found");

  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);
  const before = searchParams.get("before");
  const after = searchParams.get("after");
  const eventType = searchParams.get("eventType");

  const beforeDate = before ? new Date(before) : null;
  const afterDate = after ? new Date(after) : null;

  const where: Record<string, unknown> = { taskId: params.id };

  if (beforeDate || afterDate) {
    const createdAt: Record<string, Date> = {};
    if (beforeDate) createdAt.lt = beforeDate;
    if (afterDate) createdAt.gt = afterDate;
    where.createdAt = createdAt;
  }

  if (eventType) {
    where.eventType = eventType;
  }

  const wantTaskEvents =
    !eventType || eventType !== TIMER_SESSION_EVENT_TYPE;
  const wantTimerSessions = !eventType || eventType === TIMER_SESSION_EVENT_TYPE;

  const [taskEvents, timerSessions] = await Promise.all([
    wantTaskEvents
      ? prisma.taskEvent.findMany({
          where,
          include: { actor: { select: { id: true, name: true } } },
          orderBy: { createdAt: "desc" },
          take: limit,
        })
      : Promise.resolve([]),
    wantTimerSessions
      ? prisma.taskTimerSession.findMany({
          where: {
            taskId: params.id,
            isActive: false,
            endedAt: {
              not: null,
              ...(beforeDate ? { lt: beforeDate } : {}),
              ...(afterDate ? { gt: afterDate } : {}),
            },
          },
          include: { user: { select: { id: true, name: true } } },
          orderBy: { endedAt: "desc" },
          take: limit,
        })
      : Promise.resolve([]),
  ]);

  const formattedTaskEvents = taskEvents.map((e) => ({
    id: e.id,
    taskId: e.taskId,
    eventType: e.eventType as string,
    actorType: e.actorType as string,
    actorName:
      e.actor?.name ?? (e.actorType === "SYSTEM" ? "System" : "AI Assistant"),
    changes: e.changes as Record<string, { old: unknown; new: unknown }>,
    message: e.message,
    source: e.source as string,
    triggeredBy: e.triggeredBy,
    createdAt: e.createdAt.toISOString(),
    entityType: "task" as const,
    entityTitle: task.title,
  }));

  const formattedTimerSessions = timerSessions.map((s) => ({
    id: `timer-${s.id}`,
    taskId: s.taskId,
    eventType: TIMER_SESSION_EVENT_TYPE,
    actorType: "USER",
    actorName: s.user?.name ?? "Unknown",
    changes: {
      durationMin: { old: null, new: s.durationMin },
      startedAt: { old: null, new: s.startedAt.toISOString() },
      endedAt: { old: null, new: s.endedAt?.toISOString() ?? null },
    },
    message: null,
    source: "MANUAL",
    triggeredBy: null,
    // Sort/display by endedAt — that's when the session event happened
    createdAt: (s.endedAt ?? s.startedAt).toISOString(),
    entityType: "task" as const,
    entityTitle: task.title,
  }));

  const merged = [...formattedTaskEvents, ...formattedTimerSessions]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, limit);

  const hasMore =
    taskEvents.length === limit || timerSessions.length === limit;

  return NextResponse.json({
    events: merged,
    hasMore,
  });
}
