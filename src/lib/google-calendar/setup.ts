import { prisma } from "@/lib/prisma";
import { getGoogleCalendarClient } from "./client";

const TANDEM_CALENDAR_NAME = "Tandem GTD";
const TANDEM_CALENDAR_DESC = "Managed by Tandem GTD";

/**
 * Creates or finds the "Tandem GTD" secondary calendar in Google Calendar.
 * Returns the Google Calendar ID.
 */
export async function ensureTandemCalendar(userId: string): Promise<string> {
  const existing = await prisma.googleCalendarSync.findUnique({
    where: { userId },
  });

  const calendar = await getGoogleCalendarClient(userId);

  // If we already have a calendar ID stored, verify it still exists
  if (existing?.tandemCalendarId) {
    try {
      await calendar.calendars.get({ calendarId: existing.tandemCalendarId });
      return existing.tandemCalendarId;
    } catch {
      // Calendar was deleted in Google — fall through to search/create
    }
  }

  // Search existing calendars for one named "Tandem GTD" (or legacy "Tandem")
  const calList = await calendar.calendarList.list();
  const found = calList.data.items?.find(
    (c) => c.summary === TANDEM_CALENDAR_NAME || c.summary === "Tandem"
  );

  let calendarId: string;

  if (found?.id) {
    calendarId = found.id;
    // Rename legacy "Tandem" calendars to "Tandem GTD"
    if (found.summary !== TANDEM_CALENDAR_NAME) {
      try {
        await calendar.calendars.patch({
          calendarId,
          requestBody: { summary: TANDEM_CALENDAR_NAME, description: TANDEM_CALENDAR_DESC },
        });
      } catch {}
    }
  } else {
    // Create a new calendar
    const created = await calendar.calendars.insert({
      requestBody: {
        summary: TANDEM_CALENDAR_NAME,
        description: TANDEM_CALENDAR_DESC,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      },
    });
    calendarId = created.data.id!;
  }

  await prisma.googleCalendarSync.upsert({
    where: { userId },
    update: {
      tandemCalendarId: calendarId,
      tandemCalendarCreated: true,
    },
    create: {
      userId,
      tandemCalendarId: calendarId,
      tandemCalendarCreated: true,
    },
  });

  return calendarId;
}
