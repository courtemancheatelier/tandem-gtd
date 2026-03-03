import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api/admin-helpers";
import { generateInviteCode } from "@/lib/invite-codes";
import { z } from "zod";

const grantSchema = z.object({
  tier: z.enum(["ALPHA", "BETA"]).default("BETA"),
  count: z.number().int().min(1).max(10),
});

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const parsed = grantSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { tier, count } = parsed.data;

  // Find all users of the specified tier
  const users = await prisma.user.findMany({
    where: { tier, isDisabled: false },
    select: { id: true },
  });

  if (users.length === 0) {
    return NextResponse.json(
      { error: `No active ${tier} users found` },
      { status: 400 }
    );
  }

  let totalCreated = 0;

  for (const user of users) {
    for (let i = 0; i < count; i++) {
      let code: string;
      let attempts = 0;
      do {
        code = generateInviteCode();
        const existing = await prisma.inviteCode.findUnique({ where: { code } });
        if (!existing) break;
        attempts++;
      } while (attempts < 10);

      if (attempts < 10) {
        await prisma.inviteCode.create({
          data: {
            code,
            createdById: user.id,
          },
        });
        totalCreated++;
      }
    }
  }

  return NextResponse.json({
    success: true,
    usersGranted: users.length,
    codesCreated: totalCreated,
  });
}
