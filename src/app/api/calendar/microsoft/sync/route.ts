import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api/auth-helpers";
import {
  createMicrosoftCalendarEvent,
} from "@/lib/microsoft-calendar/client";

/**
 * POST — Retry failed Microsoft Calendar syncs.
 * Finds SYNC_ERROR or PENDING_SYNC events with a microsoftCalendarId set
 * and attempts to push them to Microsoft.
 */
export async function POST() {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const sync = await prisma.microsoftCalendarSync.findUnique({
    where: { userId },
  });
  if (!sync?.syncEnabled) {
    return NextResponse.json({ error: "Microsoft Calendar not connected" }, { status: 400 });
  }

  const calendarId = sync.defaultCalendarId ?? undefined;

  // Find events needing sync (errored or pending)
  const pendingEvents = await prisma.calendarEvent.findMany({
    where: {
      userId,
      syncStatus: { in: ["PENDING_SYNC", "SYNC_ERROR"] },
      // Only events that should go to Microsoft (not Google-synced events)
      googleEventId: null,
    },
  });

  let retriedCount = 0;

  for (const event of pendingEvents) {
    try {
      const msEvent = await createMicrosoftCalendarEvent(userId, {
        subject: event.title,
        body: event.description ? { contentType: "text", content: event.description } : undefined,
        start: {
          dateTime: (event.startTime || event.date).toISOString().replace("Z", ""),
          timeZone: "UTC",
        },
        end: {
          dateTime: (event.endTime || event.date).toISOString().replace("Z", ""),
          timeZone: "UTC",
        },
        isAllDay: event.allDay,
        location: event.location ? { displayName: event.location } : undefined,
      }, calendarId);

      await prisma.calendarEvent.update({
        where: { id: event.id },
        data: {
          syncStatus: "SYNCED",
          microsoftEventId: msEvent.id,
          microsoftCalendarId: calendarId ?? null,
          lastSyncedAt: new Date(),
          syncError: null,
        },
      });
      retriedCount++;
    } catch (err) {
      await prisma.calendarEvent.update({
        where: { id: event.id },
        data: {
          syncStatus: "SYNC_ERROR",
          syncError: err instanceof Error ? err.message.slice(0, 500) : "Unknown error",
        },
      });
    }
  }

  await prisma.microsoftCalendarSync.update({
    where: { userId },
    data: { lastSyncedAt: new Date() },
  });

  return NextResponse.json({ success: true, retriedCount });
}
