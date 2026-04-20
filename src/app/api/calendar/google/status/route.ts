import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api/auth-helpers";

export async function GET() {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  // Check for Google account with refresh token
  const googleAccount = await prisma.account.findFirst({
    where: { userId, provider: "google" },
    select: { refreshToken: true },
  });

  const sync = await prisma.googleCalendarSync.findUnique({
    where: { userId },
  });

  const connected = !!googleAccount?.refreshToken && !!sync;

  return NextResponse.json({
    connected,
    hasRefreshToken: !!googleAccount?.refreshToken,
    syncEnabled: sync?.syncEnabled ?? false,
    tandemCalendarId: sync?.tandemCalendarId ?? null,
    lastSyncedAt: sync?.lastSyncedAt ?? null,
    consecutiveErrors: sync?.consecutiveErrors ?? 0,
    lastError: sync?.lastError ?? null,
    lastErrorAt: sync?.lastErrorAt ?? null,
  });
}
