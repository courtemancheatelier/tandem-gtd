import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest } from "@/lib/api/auth-helpers";
import { getGoogleCalendarClient } from "@/lib/google-calendar/client";
import { syncExternalEvents } from "@/lib/google-calendar/sync-read";

const updateCalendarsSchema = z.object({
  calendars: z.array(z.object({
    id: z.string().max(500),
    summary: z.string().max(500),
    color: z.string().max(50),
    enabled: z.boolean(),
  })).max(50),
});

interface WatchedCalendar {
  id: string;
  summary: string;
  color: string;
  enabled: boolean;
  syncToken?: string | null;
}

/**
 * GET — List available Google Calendars + current selection.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_req: NextRequest) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const syncRecord = await prisma.googleCalendarSync.findUnique({
    where: { userId },
  });

  if (!syncRecord?.syncEnabled) {
    return NextResponse.json({ error: "Google Calendar not connected" }, { status: 400 });
  }

  try {
    const calendar = await getGoogleCalendarClient(userId);
    const res = await calendar.calendarList.list();
    const items = res.data.items || [];

    const watched = (syncRecord.watchedCalendars as WatchedCalendar[] | null) || [];
    const watchedMap = new Map(watched.map((w) => [w.id, w]));

    const calendars = items.map((item) => ({
      id: item.id,
      summary: item.summary || item.id,
      color: item.backgroundColor || "#4285f4",
      primary: item.primary || false,
      enabled: watchedMap.get(item.id!)?.enabled ?? false,
    }));

    return NextResponse.json({
      calendars,
      lastReadSyncAt: syncRecord.lastReadSyncAt,
    });
  } catch (err) {
    console.error("[google-calendar] Failed to list calendars:", err);
    return NextResponse.json({ error: "Failed to fetch calendars from Google" }, { status: 502 });
  }
}

/**
 * PATCH — Update watched calendars selection.
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireAuth("PATCH");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();
  const parsed = updateCalendarsSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }
  const { calendars } = parsed.data;

  const syncRecord = await prisma.googleCalendarSync.findUnique({
    where: { userId },
  });

  if (!syncRecord?.syncEnabled) {
    return NextResponse.json({ error: "Google Calendar not connected" }, { status: 400 });
  }

  // Preserve existing syncTokens for calendars that were already watched
  const existingWatched = (syncRecord.watchedCalendars as WatchedCalendar[] | null) || [];
  const existingMap = new Map(existingWatched.map((w) => [w.id, w]));

  const newWatched: WatchedCalendar[] = calendars.map((c) => ({
    id: c.id,
    summary: c.summary,
    color: c.color,
    enabled: c.enabled,
    syncToken: existingMap.get(c.id)?.syncToken || null,
  }));

  // Check if any newly enabled calendars need initial sync
  const newlyEnabled = newWatched.filter(
    (c) => c.enabled && !existingMap.get(c.id)?.enabled
  );

  await prisma.googleCalendarSync.update({
    where: { userId },
    data: {
      watchedCalendars: JSON.parse(JSON.stringify(newWatched)),
    },
  });

  // Fire-and-forget sync for newly enabled calendars
  if (newlyEnabled.length > 0) {
    syncExternalEvents(userId).catch((err) => console.error("[google-calendar] read sync failed:", err));
  }

  return NextResponse.json({ success: true, watchedCount: newWatched.filter((c) => c.enabled).length });
}
