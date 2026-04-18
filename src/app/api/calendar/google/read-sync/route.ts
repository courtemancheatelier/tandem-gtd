import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api/auth-helpers";
import { syncExternalEvents } from "@/lib/google-calendar/sync-read";

const AUTO_DEBOUNCE_MS = 2 * 60 * 1000; // 2 minutes for auto-sync

/**
 * POST — Trigger a read sync of external Google Calendar events.
 * Auto-sync (no ?force) is debounced to once per 2 minutes.
 * Manual sync (?force=true) always runs immediately.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const force = req.nextUrl.searchParams.get("force") === "true";

  const syncRecord = await prisma.googleCalendarSync.findUnique({
    where: { userId },
  });

  if (!syncRecord?.syncEnabled) {
    return NextResponse.json({ error: "Google Calendar not connected" }, { status: 400 });
  }

  // Debounce auto-syncs only (manual/force always runs)
  if (!force && syncRecord.lastReadSyncAt) {
    const elapsed = Date.now() - syncRecord.lastReadSyncAt.getTime();
    if (elapsed < AUTO_DEBOUNCE_MS) {
      return NextResponse.json({
        success: true,
        debounced: true,
      });
    }
  }

  const result = await syncExternalEvents(userId);

  return NextResponse.json({
    success: true,
    debounced: false,
    upserted: result.upserted,
    deleted: result.deleted,
    errors: result.errors,
  });
}
