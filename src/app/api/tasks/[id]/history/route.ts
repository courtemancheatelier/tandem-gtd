import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound } from "@/lib/api/auth-helpers";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  // Verify task belongs to user
  const task = await prisma.task.findFirst({
    where: { id: params.id, userId },
    select: { id: true },
  });
  if (!task) return notFound("Task not found");

  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);
  const before = searchParams.get("before");
  const after = searchParams.get("after");
  const eventType = searchParams.get("eventType");

  const where: Record<string, unknown> = { taskId: params.id };

  if (before || after) {
    const createdAt: Record<string, Date> = {};
    if (before) createdAt.lt = new Date(before);
    if (after) createdAt.gt = new Date(after);
    where.createdAt = createdAt;
  }

  if (eventType) {
    where.eventType = eventType;
  }

  const events = await prisma.taskEvent.findMany({
    where,
    include: {
      actor: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const formatted = events.map((e) => ({
    id: e.id,
    taskId: e.taskId,
    eventType: e.eventType,
    actorType: e.actorType,
    actorName: e.actor?.name ?? (e.actorType === "SYSTEM" ? "System" : "AI Assistant"),
    changes: e.changes,
    message: e.message,
    source: e.source,
    triggeredBy: e.triggeredBy,
    createdAt: e.createdAt.toISOString(),
  }));

  return NextResponse.json({
    events: formatted,
    hasMore: events.length === limit,
  });
}
