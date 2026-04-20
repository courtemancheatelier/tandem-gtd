import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest } from "@/lib/api/auth-helpers";
import { createChallengeSchema } from "@/lib/validations/time-audit";

/** POST /api/time-audit — Create a new challenge */
export async function POST(req: NextRequest) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();
  const parsed = createChallengeSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  // Check no active/paused challenge exists
  const existing = await prisma.timeAuditChallenge.findFirst({
    where: { userId, status: { in: ["ACTIVE", "PAUSED"] } },
  });
  if (existing) {
    return badRequest("You already have an active challenge");
  }

  const startTime = new Date(parsed.data.startTime);
  const endTime = new Date(parsed.data.endTime);

  if (endTime <= startTime) {
    return badRequest("End time must be after start time");
  }

  const challenge = await prisma.timeAuditChallenge.create({
    data: { userId, startTime, endTime },
  });

  return NextResponse.json(challenge, { status: 201 });
}

/** GET /api/time-audit — List past challenges (history) */
export async function GET() {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const challenges = await prisma.timeAuditChallenge.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { entries: true } },
    },
  });

  return NextResponse.json(challenges);
}
