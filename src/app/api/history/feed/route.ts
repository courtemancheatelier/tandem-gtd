import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api/auth-helpers";

interface FeedItem {
  id: string;
  entityType: "task" | "project" | "inbox";
  entityId: string;
  entityTitle: string;
  eventType: string;
  actorType: string;
  actorName: string;
  changes: unknown;
  message: string | null;
  source: string;
  triggeredBy: string | null;
  createdAt: string;
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);
  const before = searchParams.get("before");
  const entityTypesParam = searchParams.get("entityTypes");
  const sourcesParam = searchParams.get("sources");

  const entityTypes = entityTypesParam
    ? entityTypesParam.split(",").map((t) => t.trim())
    : ["task", "project", "inbox"];
  const sources = sourcesParam
    ? sourcesParam.split(",").map((s) => s.trim())
    : null;

  // Fetch each type with more than needed so we can merge-sort and trim
  const perTypeLimit = limit + 1;
  const beforeDate = before ? new Date(before) : undefined;

  const feedItems: FeedItem[] = [];

  // Fetch task events
  if (entityTypes.includes("task")) {
    const taskWhere: Record<string, unknown> = {
      task: { userId },
    };
    if (beforeDate) taskWhere.createdAt = { lt: beforeDate };
    if (sources) taskWhere.source = { in: sources };

    const taskEvents = await prisma.taskEvent.findMany({
      where: taskWhere,
      include: {
        actor: { select: { id: true, name: true } },
        task: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
      take: perTypeLimit,
    });

    for (const e of taskEvents) {
      feedItems.push({
        id: e.id,
        entityType: "task",
        entityId: e.task.id,
        entityTitle: e.task.title,
        eventType: e.eventType,
        actorType: e.actorType,
        actorName: e.actor?.name ?? (e.actorType === "SYSTEM" ? "System" : "AI Assistant"),
        changes: e.changes,
        message: e.message,
        source: e.source,
        triggeredBy: e.triggeredBy,
        createdAt: e.createdAt.toISOString(),
      });
    }
  }

  // Fetch project events
  if (entityTypes.includes("project")) {
    const projectWhere: Record<string, unknown> = {
      project: { userId },
    };
    if (beforeDate) projectWhere.createdAt = { lt: beforeDate };
    if (sources) projectWhere.source = { in: sources };

    const projectEvents = await prisma.projectEvent.findMany({
      where: projectWhere,
      include: {
        actor: { select: { id: true, name: true } },
        project: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
      take: perTypeLimit,
    });

    for (const e of projectEvents) {
      feedItems.push({
        id: e.id,
        entityType: "project",
        entityId: e.project.id,
        entityTitle: e.project.title,
        eventType: e.eventType,
        actorType: e.actorType,
        actorName: e.actor?.name ?? (e.actorType === "SYSTEM" ? "System" : "AI Assistant"),
        changes: e.changes,
        message: e.message,
        source: e.source,
        triggeredBy: e.triggeredBy,
        createdAt: e.createdAt.toISOString(),
      });
    }
  }

  // Fetch inbox events
  if (entityTypes.includes("inbox")) {
    const inboxWhere: Record<string, unknown> = {
      inboxItem: { userId },
    };
    if (beforeDate) inboxWhere.createdAt = { lt: beforeDate };
    if (sources) inboxWhere.source = { in: sources };

    const inboxEvents = await prisma.inboxEvent.findMany({
      where: inboxWhere,
      include: {
        actor: { select: { id: true, name: true } },
        inboxItem: { select: { id: true, content: true } },
      },
      orderBy: { createdAt: "desc" },
      take: perTypeLimit,
    });

    for (const e of inboxEvents) {
      feedItems.push({
        id: e.id,
        entityType: "inbox",
        entityId: e.inboxItem.id,
        entityTitle: e.inboxItem.content.slice(0, 80),
        eventType: e.eventType,
        actorType: e.actorType,
        actorName: e.actor?.name ?? (e.actorType === "SYSTEM" ? "System" : "AI Assistant"),
        changes: e.changes,
        message: e.message,
        source: e.source,
        triggeredBy: null,
        createdAt: e.createdAt.toISOString(),
      });
    }
  }

  // Sort by createdAt descending and trim to limit
  feedItems.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const trimmed = feedItems.slice(0, limit);
  const hasMore = feedItems.length > limit;

  return NextResponse.json({
    events: trimmed,
    hasMore,
  });
}
