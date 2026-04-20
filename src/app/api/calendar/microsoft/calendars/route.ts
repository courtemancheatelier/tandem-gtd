import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api/auth-helpers";
import { listMicrosoftCalendars } from "@/lib/microsoft-calendar/client";

export async function GET() {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const sync = await prisma.microsoftCalendarSync.findUnique({
    where: { userId },
  });
  if (!sync?.syncEnabled) {
    return NextResponse.json({ calendars: [], lastReadSyncAt: null });
  }

  try {
    const msCalendars = await listMicrosoftCalendars(userId);
    const watched = (sync.watchedCalendars as { id: string; enabled: boolean }[]) || [];
    const watchedMap = new Map(watched.map((w) => [w.id, w.enabled]));

    const calendars = msCalendars.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color || "#0078D4",
      primary: c.isDefaultCalendar,
      enabled: watchedMap.get(c.id) ?? c.isDefaultCalendar,
    }));

    return NextResponse.json({
      calendars,
      lastReadSyncAt: sync.lastReadSyncAt,
    });
  } catch (err) {
    console.error("[microsoft-calendar] List calendars failed:", err);
    return NextResponse.json({ calendars: [], lastReadSyncAt: null });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth("PATCH");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { calendars } = await req.json();
  await prisma.microsoftCalendarSync.update({
    where: { userId },
    data: { watchedCalendars: calendars },
  });

  return NextResponse.json({ success: true });
}
