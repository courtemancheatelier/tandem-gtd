import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest } from "@/lib/api/auth-helpers";
import { ensureTandemCalendar } from "@/lib/google-calendar/setup";

export async function POST() {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  // Verify Google account with refresh token
  const googleAccount = await prisma.account.findFirst({
    where: { userId, provider: "google" },
    select: { refreshToken: true },
  });

  if (!googleAccount?.refreshToken) {
    return badRequest(
      "No Google account with refresh token. Please re-authenticate with Google from Settings > Linked Accounts."
    );
  }

  try {
    const calendarId = await ensureTandemCalendar(userId);

    // Enable sync
    await prisma.googleCalendarSync.upsert({
      where: { userId },
      update: { syncEnabled: true, consecutiveErrors: 0, lastError: null },
      create: {
        userId,
        syncEnabled: true,
        tandemCalendarId: calendarId,
        tandemCalendarCreated: true,
      },
    });

    return NextResponse.json({
      success: true,
      tandemCalendarId: calendarId,
    });
  } catch (err) {
    console.error("[google-calendar] Connect failed:", err);
    return NextResponse.json(
      { error: "Failed to connect Google Calendar" },
      { status: 500 }
    );
  }
}
