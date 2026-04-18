import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api/auth-helpers";
import { getMicrosoftCalendarEvents } from "@/lib/microsoft-calendar/client";

const AUTO_DEBOUNCE_MS = 2 * 60 * 1000;

export async function POST(req: NextRequest) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const force = req.nextUrl.searchParams.get("force") === "true";

  const sync = await prisma.microsoftCalendarSync.findUnique({
    where: { userId },
  });
  if (!sync?.syncEnabled) {
    return NextResponse.json({ error: "Microsoft Calendar not connected" }, { status: 400 });
  }

  // Debounce auto-syncs
  if (!force && sync.lastReadSyncAt) {
    const elapsed = Date.now() - sync.lastReadSyncAt.getTime();
    if (elapsed < AUTO_DEBOUNCE_MS) {
      return NextResponse.json({ success: true, debounced: true });
    }
  }

  try {
    const watched = (sync.watchedCalendars as { id: string; name: string; color: string; enabled: boolean }[]) || [];
    const enabledCalendars = watched.filter((c) => c.enabled);

    let upserted = 0;
    let deleted = 0;

    // Sync window: 30 days back, 90 days forward
    const start = new Date();
    start.setDate(start.getDate() - 30);
    const end = new Date();
    end.setDate(end.getDate() + 90);

    for (const cal of enabledCalendars) {
      const events = await getMicrosoftCalendarEvents(userId, start, end, cal.id);

      const externalIds = new Set<string>();

      for (const event of events) {
        externalIds.add(event.id);

        const startDate = new Date(event.start.dateTime + "Z");
        const endDate = new Date(event.end.dateTime + "Z");

        await prisma.calendarEvent.upsert({
          where: {
            userId_googleEventId_googleCalendarId: {
              userId,
              googleEventId: `ms-${event.id}`,
              googleCalendarId: `ms-${cal.id}`,
            },
          },
          update: {
            title: event.subject || "(No subject)",
            description: event.body?.content?.slice(0, 5000) || null,
            date: startDate,
            startTime: event.isAllDay ? null : startDate,
            endTime: event.isAllDay ? null : endDate,
            allDay: event.isAllDay,
            location: event.location?.displayName || null,
            color: cal.color || "#0078D4",
            syncStatus: "EXTERNAL",
            microsoftEventId: event.id,
            microsoftCalendarId: cal.id,
            lastSyncedAt: new Date(),
          },
          create: {
            userId,
            title: event.subject || "(No subject)",
            description: event.body?.content?.slice(0, 5000) || null,
            date: startDate,
            startTime: event.isAllDay ? null : startDate,
            endTime: event.isAllDay ? null : endDate,
            allDay: event.isAllDay,
            location: event.location?.displayName || null,
            color: cal.color || "#0078D4",
            syncStatus: "EXTERNAL",
            googleEventId: `ms-${event.id}`,
            googleCalendarId: `ms-${cal.id}`,
            microsoftEventId: event.id,
            microsoftCalendarId: cal.id,
            lastSyncedAt: new Date(),
          },
        });
        upserted++;
      }

      // Delete events that are no longer in Microsoft
      const staleEvents = await prisma.calendarEvent.findMany({
        where: {
          userId,
          microsoftCalendarId: cal.id,
          syncStatus: "EXTERNAL",
          microsoftEventId: { not: null },
        },
        select: { id: true, microsoftEventId: true },
      });

      for (const stale of staleEvents) {
        if (stale.microsoftEventId && !externalIds.has(stale.microsoftEventId)) {
          await prisma.calendarEvent.delete({ where: { id: stale.id } });
          deleted++;
        }
      }
    }

    await prisma.microsoftCalendarSync.update({
      where: { userId },
      data: {
        lastReadSyncAt: new Date(),
        lastSyncedAt: new Date(),
        consecutiveErrors: 0,
        lastError: null,
      },
    });

    return NextResponse.json({ success: true, debounced: false, upserted, deleted, errors: 0 });
  } catch (err) {
    console.error("[microsoft-calendar] Read sync failed:", err);
    await prisma.microsoftCalendarSync.update({
      where: { userId },
      data: {
        consecutiveErrors: { increment: 1 },
        lastError: err instanceof Error ? err.message.slice(0, 500) : "Unknown error",
        lastErrorAt: new Date(),
      },
    });
    return NextResponse.json(
      { error: "Microsoft Calendar sync failed" },
      { status: 500 }
    );
  }
}
