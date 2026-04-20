import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { z } from "zod";
import { checkRateLimit } from "@/lib/api/rate-limit";

const setupPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function POST(req: NextRequest) {
  // Rate limit by IP: 5 attempts per 15 minutes
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = checkRateLimit(`setup-password:${ip}`, 5, 15 * 60_000);
  if (rl) return rl;

  const body = await req.json();
  const parsed = setupPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    );
  }

  const { token, password } = parsed.data;

  // Hash the incoming token to match the stored hash
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const setupToken = await prisma.passwordSetupToken.findUnique({
    where: { token: tokenHash },
    include: { user: { select: { id: true, isDisabled: true } } },
  });

  // Use a single generic error for all invalid token states to prevent enumeration
  const invalidTokenResponse = () =>
    NextResponse.json({ error: "Invalid or expired setup link." }, { status: 400 });

  if (!setupToken || setupToken.usedAt || setupToken.expiresAt < new Date() || setupToken.user.isDisabled) {
    return invalidTokenResponse();
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: setupToken.userId },
      data: { password: hashedPassword },
    }),
    prisma.passwordSetupToken.update({
      where: { id: setupToken.id },
      data: { usedAt: new Date() },
    }),
  ]);

  return NextResponse.json({ success: true });
}
