import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api/auth-helpers";

export async function GET() {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { onboardingCompletedAt: true },
  });

  return NextResponse.json({
    onboardingCompleted: user.onboardingCompletedAt !== null,
  });
}
