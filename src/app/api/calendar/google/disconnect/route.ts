import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api/auth-helpers";
import { getGoogleCalendarClient } from "@/lib/google-calendar/client";

export async function POST(req: NextRequest) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { searchParams } = new URL(req.url);
  const deleteTandemCalendar = searchParams.get("deleteTandemCalendar") === "true";

  const sync = await prisma.googleCalendarSync.findUnique({
    where: { userId },
  });

  // Optionally delete the Tandem calendar from Google
  if (deleteTandemCalendar && sync?.tandemCalendarId) {
    try {
      const calendar = await getGoogleCalendarClient(userId);
      await calendar.calendars.delete({ calendarId: sync.tandemCalendarId });
    } catch (err) {
      console.error("[google-calendar] Failed to delete Tandem calendar from Google:", err);
      // Continue with disconnect even if Google delete fails
    }
  }

  // Delete external events (pulled from Google) — they don't belong in Tandem
  // without a sync connection. If we just reset their fields, they become
  // orphaned local events and cause duplicates on reconnect.
  await prisma.calendarEvent.deleteMany({
    where: { userId, syncStatus: "EXTERNAL" },
  });

  // Reset sync state on Tandem-owned events (pushed to Google)
  await prisma.calendarEvent.updateMany({
    where: { userId },
    data: {
      syncStatus: "NOT_SYNCED",
      googleEventId: null,
      googleCalendarId: null,
      lastSyncedAt: null,
      syncError: null,
    },
  });

  // Delete sync record
  if (sync) {
    await prisma.googleCalendarSync.delete({ where: { userId } });
  }

  return NextResponse.json({ success: true });
}
