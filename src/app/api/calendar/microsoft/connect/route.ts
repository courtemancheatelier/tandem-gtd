import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest } from "@/lib/api/auth-helpers";
import { listMicrosoftCalendars } from "@/lib/microsoft-calendar/client";

export async function POST() {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const msAccount = await prisma.account.findFirst({
    where: { userId, provider: "azure-ad" },
    select: { refreshToken: true },
  });

  if (!msAccount?.refreshToken) {
    return badRequest(
      "No Microsoft account with refresh token. Please re-authenticate with Microsoft from Settings > Linked Accounts."
    );
  }

  try {
    // Fetch calendars to find the default one
    const calendars = await listMicrosoftCalendars(userId);
    const defaultCal = calendars.find((c) => c.isDefaultCalendar);

    await prisma.microsoftCalendarSync.upsert({
      where: { userId },
      update: { syncEnabled: true, consecutiveErrors: 0, lastError: null },
      create: {
        userId,
        syncEnabled: true,
        defaultCalendarId: defaultCal?.id ?? null,
        watchedCalendars: calendars.map((c) => ({
          id: c.id,
          name: c.name,
          color: c.color,
          enabled: c.isDefaultCalendar,
        })),
      },
    });

    return NextResponse.json({
      success: true,
      defaultCalendarId: defaultCal?.id ?? null,
    });
  } catch (err) {
    console.error("[microsoft-calendar] Connect failed:", err);
    return NextResponse.json(
      { error: "Failed to connect Microsoft Calendar" },
      { status: 500 }
    );
  }
}
