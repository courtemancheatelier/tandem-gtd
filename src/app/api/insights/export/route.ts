import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api/auth-helpers";

function parseRange(range: string | null): Date {
  const now = new Date();
  switch (range) {
    case "30d":
      return new Date(now.getTime() - 30 * 86400000);
    case "1y":
      return new Date(now.getTime() - 365 * 86400000);
    case "all":
      return new Date(0);
    case "90d":
    default:
      return new Date(now.getTime() - 90 * 86400000);
  }
}

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const format = request.nextUrl.searchParams.get("format") ?? "json";
  const range = request.nextUrl.searchParams.get("range");
  const since = parseRange(range);

  const [taskEvents, projectEvents, inboxEvents] = await Promise.all([
    prisma.taskEvent.findMany({
      where: {
        task: { userId },
        createdAt: { gte: since },
      },
      select: {
        id: true,
        taskId: true,
        eventType: true,
        actorType: true,
        source: true,
        changes: true,
        message: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.projectEvent.findMany({
      where: {
        project: { userId },
        createdAt: { gte: since },
      },
      select: {
        id: true,
        projectId: true,
        eventType: true,
        actorType: true,
        source: true,
        changes: true,
        message: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.inboxEvent.findMany({
      where: {
        inboxItem: { userId },
        createdAt: { gte: since },
      },
      select: {
        id: true,
        inboxItemId: true,
        eventType: true,
        actorType: true,
        source: true,
        changes: true,
        message: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Normalize all events into a flat structure
  type FlatEvent = {
    id: string;
    entityType: string;
    entityId: string;
    eventType: string;
    actorType: string;
    source: string;
    changes: string;
    message: string;
    createdAt: string;
  };

  const allEvents: FlatEvent[] = [
    ...taskEvents.map((e) => ({
      id: e.id,
      entityType: "Task",
      entityId: e.taskId,
      eventType: e.eventType,
      actorType: e.actorType,
      source: e.source,
      changes: JSON.stringify(e.changes),
      message: e.message ?? "",
      createdAt: e.createdAt.toISOString(),
    })),
    ...projectEvents.map((e) => ({
      id: e.id,
      entityType: "Project",
      entityId: e.projectId,
      eventType: e.eventType,
      actorType: e.actorType,
      source: e.source,
      changes: JSON.stringify(e.changes),
      message: e.message ?? "",
      createdAt: e.createdAt.toISOString(),
    })),
    ...inboxEvents.map((e) => ({
      id: e.id,
      entityType: "Inbox",
      entityId: e.inboxItemId,
      eventType: e.eventType,
      actorType: e.actorType,
      source: e.source,
      changes: JSON.stringify(e.changes),
      message: e.message ?? "",
      createdAt: e.createdAt.toISOString(),
    })),
  ].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  if (format === "csv") {
    const headers = [
      "id",
      "entityType",
      "entityId",
      "eventType",
      "actorType",
      "source",
      "changes",
      "message",
      "createdAt",
    ];
    const rows = allEvents.map((e) =>
      headers.map((h) => escapeCSV(String(e[h as keyof FlatEvent]))).join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="tandem-history.csv"',
      },
    });
  }

  // Default: JSON
  return new NextResponse(JSON.stringify(allEvents, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition":
        'attachment; filename="tandem-history.json"',
    },
  });
}
