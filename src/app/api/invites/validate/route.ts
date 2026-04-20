import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/api/rate-limit";

export async function GET(req: NextRequest) {
  // Rate limit by IP: 10 attempts per minute
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = checkRateLimit(`invite-validate:${ip}`, 10, 60_000);
  if (rl) return rl;

  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.json({ valid: false });
  }

  const inviteCode = await prisma.inviteCode.findUnique({
    where: { code: code.toUpperCase() },
    select: { id: true, usedById: true, expiresAt: true },
  });

  if (!inviteCode) {
    return NextResponse.json({ valid: false });
  }

  if (inviteCode.usedById) {
    return NextResponse.json({ valid: false });
  }

  if (inviteCode.expiresAt && inviteCode.expiresAt < new Date()) {
    return NextResponse.json({ valid: false });
  }

  return NextResponse.json({ valid: true });
}
