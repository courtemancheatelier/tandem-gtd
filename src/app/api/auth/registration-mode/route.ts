import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await prisma.serverSettings.findUnique({
    where: { id: "singleton" },
    select: { registrationMode: true, authMode: true, trialDurationDays: true },
  });

  return NextResponse.json({
    registrationMode: settings?.registrationMode ?? "OPEN",
    authMode: settings?.authMode ?? "OAUTH_AND_CREDENTIALS",
    trialDurationDays: settings?.trialDurationDays ?? 30,
    providers: {
      google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      apple: !!(process.env.APPLE_ID && process.env.APPLE_SECRET),
      github: !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
      microsoft: !!(process.env.MICROSOFT_ENTRA_ID_CLIENT_ID && process.env.MICROSOFT_ENTRA_ID_CLIENT_SECRET),
    },
  });
}
