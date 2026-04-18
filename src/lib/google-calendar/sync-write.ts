import { prisma } from "@/lib/prisma";
import { getGoogleCalendarClient } from "./client";
import type { calendar_v3 } from "googleapis";

const MAX_CONSECUTIVE_ERRORS = 5;
const MAX_RETRY_BATCH = 20;

/**
 * Convert a Tandem CalendarEvent to Google Calendar event format.
 */
function toGoogleEvent(event: {
  title: string;
  description?: string | null;
  eventType: string;
  date: Date;
  startTime?: Date | null;
  endTime?: Date | null;
  allDay?: boolean;
  location?: string | null;
  reminderMinutes?: number | null;
  recurrenceRule?: string | null;
  taskId?: string | null;
}): calendar_v3.Schema$Event {
  const isAllDay = event.allDay || !event.startTime || event.eventType === "DAY_SPECIFIC" || event.eventType === "INFORMATION";

  // Build title with prefix for special types
  let title = event.title;
  if (event.eventType === "INFORMATION") title = `ℹ️ ${title}`;
  else if (event.eventType === "TIME_BLOCK") title = `⏱️ ${title}`;

  // Build description
  const descParts: string[] = [];
  if (event.description) descParts.push(event.description);
  descParts.push("Managed by Tandem GTD");
  const description = descParts.join("\n\n");

  const googleEvent: calendar_v3.Schema$Event = {
    summary: title,
    description,
    location: event.location ?? undefined,
  };

  if (isAllDay) {
    // All-day event: use date (YYYY-MM-DD) format
    const dateStr = event.date.toISOString().slice(0, 10);
    googleEvent.start = { date: dateStr };
    googleEvent.end = { date: dateStr };
  } else {
    // Timed event
    googleEvent.start = { dateTime: event.startTime!.toISOString() };
    googleEvent.end = {
      dateTime: event.endTime
        ? event.endTime.toISOString()
        : new Date(event.startTime!.getTime() + 30 * 60 * 1000).toISOString(),
    };
  }

  // Set recurrence rule (sync parent only)
  if (event.recurrenceRule) {
    googleEvent.recurrence = [`RRULE:${event.recurrenceRule}`];
  }

  // Set reminders
  if (event.eventType === "INFORMATION") {
    // No reminders for information events
    googleEvent.reminders = { useDefault: false, overrides: [] };
  } else if (event.reminderMinutes != null) {
    googleEvent.reminders = {
      useDefault: false,
      overrides: [{ method: "popup", minutes: event.reminderMinutes }],
    };
  }

  return googleEvent;
}

/**
 * Sync a single calendar event to Google Calendar.
 * Called after every create/update/delete operation.
 */
export async function syncEventToGoogle(
  eventId: string,
  operation: "create" | "update" | "delete"
): Promise<void> {
  try {
    const calendarEvent = await prisma.calendarEvent.findUnique({
      where: { id: eventId },
      include: {
        user: {
          include: {
            googleCalendarSync: true,
          },
        },
      },
    });

    if (!calendarEvent) return;

    const sync = calendarEvent.user.googleCalendarSync;

    // If sync not enabled or no calendar ID, mark as NOT_SYNCED
    if (!sync?.syncEnabled || !sync.tandemCalendarId) {
      if (operation !== "delete") {
        await prisma.calendarEvent.update({
          where: { id: eventId },
          data: { syncStatus: "NOT_SYNCED" },
        });
      }
      return;
    }

    const calendar = await getGoogleCalendarClient(calendarEvent.userId);
    const calendarId = sync.tandemCalendarId;

    if (operation === "create") {
      const googleEvent = toGoogleEvent(calendarEvent);
      const result = await calendar.events.insert({
        calendarId,
        requestBody: googleEvent,
      });

      await prisma.calendarEvent.update({
        where: { id: eventId },
        data: {
          googleEventId: result.data.id,
          googleCalendarId: calendarId,
          syncStatus: "SYNCED",
          lastSyncedAt: new Date(),
          syncError: null,
        },
      });
    } else if (operation === "update") {
      if (!calendarEvent.googleEventId) {
        // Not yet synced — do a create instead
        return syncEventToGoogle(eventId, "create");
      }

      const googleEvent = toGoogleEvent(calendarEvent);
      await calendar.events.update({
        calendarId,
        eventId: calendarEvent.googleEventId,
        requestBody: googleEvent,
      });

      await prisma.calendarEvent.update({
        where: { id: eventId },
        data: {
          syncStatus: "SYNCED",
          lastSyncedAt: new Date(),
          syncError: null,
        },
      });
    } else if (operation === "delete") {
      if (calendarEvent.googleEventId) {
        try {
          await calendar.events.delete({
            calendarId,
            eventId: calendarEvent.googleEventId,
          });
        } catch (err: unknown) {
          // 404/410 = already deleted in Google, that's fine
          const status = (err as { code?: number })?.code;
          if (status !== 404 && status !== 410) throw err;
        }
      }
      // The Tandem event will be deleted by the caller
    }

    // Reset consecutive errors on success
    await prisma.googleCalendarSync.update({
      where: { userId: calendarEvent.userId },
      data: { consecutiveErrors: 0, lastSyncedAt: new Date(), lastError: null },
    });
  } catch (err) {
    console.error(`[google-calendar] Sync error for event ${eventId}:`, err);

    // Try to update event sync status
    try {
      const event = await prisma.calendarEvent.findUnique({
        where: { id: eventId },
        select: { userId: true },
      });

      if (event && operation !== "delete") {
        await prisma.calendarEvent.update({
          where: { id: eventId },
          data: {
            syncStatus: "SYNC_ERROR",
            syncError: err instanceof Error ? err.message : "Unknown error",
          },
        });
      }

      if (event) {
        const syncRecord = await prisma.googleCalendarSync.findUnique({
          where: { userId: event.userId },
        });

        if (syncRecord) {
          const newErrors = syncRecord.consecutiveErrors + 1;
          await prisma.googleCalendarSync.update({
            where: { userId: event.userId },
            data: {
              consecutiveErrors: newErrors,
              lastError: err instanceof Error ? err.message : "Unknown error",
              lastErrorAt: new Date(),
              // Circuit breaker: disable sync after MAX_CONSECUTIVE_ERRORS
              ...(newErrors >= MAX_CONSECUTIVE_ERRORS ? { syncEnabled: false } : {}),
            },
          });
        }
      }
    } catch (innerErr) {
      console.error("[google-calendar] Failed to record sync error:", innerErr);
    }
  }
}

/**
 * Retry failed syncs for a user. Processes up to MAX_RETRY_BATCH events.
 * Returns the number of events retried.
 */
export async function retryFailedSyncs(userId: string): Promise<number> {
  const failedEvents = await prisma.calendarEvent.findMany({
    where: {
      userId,
      syncStatus: { in: ["PENDING_SYNC", "SYNC_ERROR"] },
    },
    take: MAX_RETRY_BATCH,
    orderBy: { createdAt: "asc" },
  });

  let retried = 0;
  for (const event of failedEvents) {
    const op = event.googleEventId ? "update" : "create";
    await syncEventToGoogle(event.id, op);
    retried++;
  }

  return retried;
}
