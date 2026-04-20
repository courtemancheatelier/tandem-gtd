import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api/auth-helpers";

export async function POST() {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  // Delete external events pulled from Microsoft
  await prisma.calendarEvent.deleteMany({
    where: {
      userId,
      microsoftEventId: { not: null },
      syncStatus: "EXTERNAL",
    },
  });

  // Reset sync state on Tandem events pushed to Microsoft
  await prisma.calendarEvent.updateMany({
    where: { userId, microsoftEventId: { not: null } },
    data: {
      microsoftEventId: null,
      microsoftCalendarId: null,
      syncStatus: "NOT_SYNCED",
      lastSyncedAt: null,
      syncError: null,
    },
  });

  // Delete sync record
  const sync = await prisma.microsoftCalendarSync.findUnique({ where: { userId } });
  if (sync) {
    await prisma.microsoftCalendarSync.delete({ where: { userId } });
  }

  return NextResponse.json({ success: true });
}
