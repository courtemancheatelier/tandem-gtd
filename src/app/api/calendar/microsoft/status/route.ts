import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api/auth-helpers";

export async function GET() {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const msAccount = await prisma.account.findFirst({
    where: { userId, provider: "azure-ad" },
    select: { refreshToken: true },
  });

  const sync = await prisma.microsoftCalendarSync.findUnique({
    where: { userId },
  });

  const connected = !!msAccount?.refreshToken && !!sync;

  return NextResponse.json({
    connected,
    hasRefreshToken: !!msAccount?.refreshToken,
    syncEnabled: sync?.syncEnabled ?? false,
    defaultCalendarId: sync?.defaultCalendarId ?? null,
    lastSyncedAt: sync?.lastSyncedAt ?? null,
    consecutiveErrors: sync?.consecutiveErrors ?? 0,
    lastError: sync?.lastError ?? null,
    lastErrorAt: sync?.lastErrorAt ?? null,
  });
}
