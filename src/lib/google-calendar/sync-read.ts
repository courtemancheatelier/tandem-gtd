import { prisma } from "@/lib/prisma";
import { getGoogleCalendarClient } from "./client";
import type { calendar_v3 } from "googleapis";

const MAX_CONSECUTIVE_ERRORS = 5;

// Google Calendar event colorId → hex color mapping
// https://developers.google.com/calendar/api/v3/reference/colors/get
const GOOGLE_EVENT_COLORS: Record<string, string> = {
  "1": "#7986cb",  // Lavender
  "2": "#33b679",  // Sage
  "3": "#8e24aa",  // Grape
  "4": "#e67c73",  // Flamingo
  "5": "#f6bf26",  // Banana
  "6": "#f4511e",  // Tangerine
  "7": "#039be5",  // Peacock
  "8": "#616161",  // Graphite
  "9": "#3f51b5",  // Blueberry
  "10": "#0b8043", // Basil
  "11": "#d50000", // Tomato
};

interface WatchedCalendar {
  id: string;
  summary: string;
  color: string;
  enabled: boolean;
  syncToken?: string | null;
}

interface SyncResult {
  upserted: number;
  deleted: number;
  errors: number;
}

/**
 * Map a Google Calendar event to Tandem CalendarEvent fields.
 */
function fromGoogleEvent(
  googleEvent: calendar_v3.Schema$Event,
  userId: string,
  googleCalendarId: string,
  calendarColor?: string
) {
  const isAllDay = !!googleEvent.start?.date;

  let date: Date;
  let startTime: Date | null = null;
  let endTime: Date | null = null;
  let allDay = false;

  if (isAllDay) {
    date = new Date(googleEvent.start!.date! + "T00:00:00");
    allDay = true;
  } else {
    const startDT = new Date(googleEvent.start!.dateTime!);
    date = new Date(startDT);
    date.setHours(0, 0, 0, 0);
    startTime = startDT;
    endTime = googleEvent.end?.dateTime ? new Date(googleEvent.end.dateTime) : null;
  }

  // Strip HTML tags from Google event data
  const rawDescription = googleEvent.description || null;
  const description = rawDescription ? rawDescription.replace(/<[^>]*>/g, "") : null;

  // Resolve color: event-level colorId takes priority, then calendar background color
  const color = googleEvent.colorId
    ? (GOOGLE_EVENT_COLORS[googleEvent.colorId] ?? calendarColor ?? null)
    : (calendarColor ?? null);

  return {
    title: (googleEvent.summary || "(No title)").replace(/<[^>]*>/g, ""),
    description,
    eventType: allDay ? "DAY_SPECIFIC" as const : "TIME_SPECIFIC" as const,
    date,
    startTime,
    endTime,
    allDay,
    location: googleEvent.location || null,
    color,
    syncStatus: "EXTERNAL" as const,
    googleEventId: googleEvent.id!,
    googleCalendarId,
    lastSyncedAt: new Date(),
    userId,
  };
}

/**
 * Sync external events from watched Google Calendars into Tandem.
 * Uses incremental sync (syncToken) when available, full fetch otherwise.
 */
export async function syncExternalEvents(userId: string): Promise<SyncResult> {
  const result: SyncResult = { upserted: 0, deleted: 0, errors: 0 };

  const syncRecord = await prisma.googleCalendarSync.findUnique({
    where: { userId },
  });

  if (!syncRecord?.syncEnabled) return result;

  const watchedCalendars = (syncRecord.watchedCalendars as WatchedCalendar[] | null) || [];
  const enabledCalendars = watchedCalendars.filter((c) => c.enabled);
  if (enabledCalendars.length === 0) return result;

  let calendar: Awaited<ReturnType<typeof getGoogleCalendarClient>>;
  try {
    calendar = await getGoogleCalendarClient(userId);
  } catch {
    return result;
  }

  for (const watched of enabledCalendars) {
    try {
      await syncOneCalendar(calendar, userId, watched, watchedCalendars, syncRecord.id, result);
    } catch (err) {
      console.error(`[google-calendar] Read sync error for calendar ${watched.id}:`, err);
      result.errors++;
    }
  }

  // Update lastReadSyncAt and persist watchedCalendars with updated syncTokens
  await prisma.googleCalendarSync.update({
    where: { id: syncRecord.id },
    data: {
      lastReadSyncAt: new Date(),
      watchedCalendars: JSON.parse(JSON.stringify(watchedCalendars)),
      // Reset errors on success
      ...(result.errors === 0
        ? { consecutiveErrors: 0, lastError: null }
        : {
            consecutiveErrors: syncRecord.consecutiveErrors + result.errors,
            lastError: `Read sync: ${result.errors} calendar(s) failed`,
            lastErrorAt: new Date(),
          }),
    },
  });

  // Circuit breaker
  if (syncRecord.consecutiveErrors + result.errors >= MAX_CONSECUTIVE_ERRORS) {
    await prisma.googleCalendarSync.update({
      where: { id: syncRecord.id },
      data: { syncEnabled: false },
    });
  }

  return result;
}

async function syncOneCalendar(
  calendar: Awaited<ReturnType<typeof getGoogleCalendarClient>>,
  userId: string,
  watched: WatchedCalendar,
  allWatched: WatchedCalendar[],
  syncRecordId: string,
  result: SyncResult
) {
  const hasSyncToken = !!watched.syncToken;

  try {
    if (hasSyncToken) {
      await incrementalSync(calendar, userId, watched, allWatched, result);
    } else {
      await fullSync(calendar, userId, watched, allWatched, result);
    }
  } catch (err: unknown) {
    // Handle 410 Gone — sync token expired, do a full re-sync
    const code = (err as { code?: number })?.code;
    if (code === 410 && hasSyncToken) {
      watched.syncToken = null;
      await fullSync(calendar, userId, watched, allWatched, result);
    } else {
      throw err;
    }
  }
}

async function fullSync(
  calendar: Awaited<ReturnType<typeof getGoogleCalendarClient>>,
  userId: string,
  watched: WatchedCalendar,
  allWatched: WatchedCalendar[],
  result: SyncResult
) {
  const now = new Date();
  const timeMin = new Date(now);
  timeMin.setDate(timeMin.getDate() - 30);
  const timeMax = new Date(now);
  timeMax.setDate(timeMax.getDate() + 90);

  let pageToken: string | undefined;

  do {
    const res = await calendar.events.list({
      calendarId: watched.id,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      maxResults: 250,
      pageToken,
    });

    const events = res.data.items || [];
    for (const gEvent of events) {
      if (!gEvent.id) continue;
      await upsertExternalEvent(gEvent, userId, watched.id, watched.color, result);
    }

    pageToken = res.data.nextPageToken ?? undefined;

    // Save nextSyncToken from the last page
    if (!pageToken && res.data.nextSyncToken) {
      const idx = allWatched.findIndex((c) => c.id === watched.id);
      if (idx >= 0) allWatched[idx].syncToken = res.data.nextSyncToken;
    }
  } while (pageToken);
}

async function incrementalSync(
  calendar: Awaited<ReturnType<typeof getGoogleCalendarClient>>,
  userId: string,
  watched: WatchedCalendar,
  allWatched: WatchedCalendar[],
  result: SyncResult
) {
  let pageToken: string | undefined;

  do {
    const res = await calendar.events.list({
      calendarId: watched.id,
      syncToken: watched.syncToken!,
      maxResults: 250,
      pageToken,
    });

    const events = res.data.items || [];
    for (const gEvent of events) {
      if (!gEvent.id) continue;

      if (gEvent.status === "cancelled") {
        // Delete cancelled events
        const deleted = await prisma.calendarEvent.deleteMany({
          where: {
            userId,
            googleEventId: gEvent.id,
            googleCalendarId: watched.id,
            syncStatus: "EXTERNAL",
          },
        });
        result.deleted += deleted.count;
      } else {
        await upsertExternalEvent(gEvent, userId, watched.id, watched.color, result);
      }
    }

    pageToken = res.data.nextPageToken ?? undefined;

    if (!pageToken && res.data.nextSyncToken) {
      const idx = allWatched.findIndex((c) => c.id === watched.id);
      if (idx >= 0) allWatched[idx].syncToken = res.data.nextSyncToken;
    }
  } while (pageToken);
}

async function upsertExternalEvent(
  gEvent: calendar_v3.Schema$Event,
  userId: string,
  googleCalendarId: string,
  calendarColor: string,
  result: SyncResult
) {
  const data = fromGoogleEvent(gEvent, userId, googleCalendarId, calendarColor);

  // Clean up orphaned duplicates left by a previous disconnect.
  // Disconnect resets EXTERNAL events to NOT_SYNCED with null googleEventId,
  // so they look like local events. Delete any that match this incoming
  // Google event by title + date to prevent duplicates.
  await prisma.calendarEvent.deleteMany({
    where: {
      userId,
      title: data.title,
      date: data.date,
      googleEventId: null,
      syncStatus: "NOT_SYNCED",
    },
  });

  await prisma.calendarEvent.upsert({
    where: {
      userId_googleEventId_googleCalendarId: {
        userId,
        googleEventId: gEvent.id!,
        googleCalendarId,
      },
    },
    create: data,
    update: {
      title: data.title,
      description: data.description,
      eventType: data.eventType,
      date: data.date,
      startTime: data.startTime,
      endTime: data.endTime,
      allDay: data.allDay,
      location: data.location,
      color: data.color,
      lastSyncedAt: data.lastSyncedAt,
    },
  });

  result.upserted++;
}
