import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound } from "@/lib/api/auth-helpers";
import { updateChallengeSchema } from "@/lib/validations/time-audit";
import { generateSummary } from "@/lib/time-audit/summary";

/** PATCH /api/time-audit/[id] — Update status (pause/resume/complete/abandon) */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("PATCH");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const challenge = await prisma.timeAuditChallenge.findFirst({
    where: { id: params.id, userId },
  });
  if (!challenge) return notFound("Challenge not found");

  const body = await req.json();

  // Special case: resume (set status back to ACTIVE)
  if (body.status === "ACTIVE") {
    if (challenge.status !== "PAUSED") {
      return badRequest("Can only resume a paused challenge");
    }
    const pausedMs = challenge.pausedAt
      ? Date.now() - challenge.pausedAt.getTime()
      : 0;
    const additionalPausedMins = Math.floor(pausedMs / 60_000);

    const updated = await prisma.timeAuditChallenge.update({
      where: { id: params.id },
      data: {
        status: "ACTIVE",
        pausedAt: null,
        totalPaused: challenge.totalPaused + additionalPausedMins,
      },
    });
    return NextResponse.json(updated);
  }

  const parsed = updateChallengeSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  const { status } = parsed.data;

  // Validate transitions
  if (status === "PAUSED" && challenge.status !== "ACTIVE") {
    return badRequest("Can only pause an active challenge");
  }
  if (
    (status === "COMPLETED" || status === "ABANDONED") &&
    !["ACTIVE", "PAUSED"].includes(challenge.status)
  ) {
    return badRequest("Challenge is already finished");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = { status };

  if (status === "PAUSED") {
    data.pausedAt = new Date();
  }

  if (status === "COMPLETED" || status === "ABANDONED") {
    // Accumulate any current pause time
    if (challenge.status === "PAUSED" && challenge.pausedAt) {
      const pausedMs = Date.now() - challenge.pausedAt.getTime();
      data.totalPaused =
        challenge.totalPaused + Math.floor(pausedMs / 60_000);
    }
    data.pausedAt = null;
  }

  // On complete, generate summary
  if (status === "COMPLETED") {
    const entries = await prisma.timeAuditEntry.findMany({
      where: { challengeId: params.id },
      orderBy: { intervalStart: "asc" },
    });

    const finalChallenge = {
      startTime: challenge.startTime,
      endTime: challenge.endTime,
      totalPaused: data.totalPaused ?? challenge.totalPaused,
    };

    data.summary = generateSummary(finalChallenge, entries);
  }

  const updated = await prisma.timeAuditChallenge.update({
    where: { id: params.id },
    data,
  });

  return NextResponse.json(updated);
}

/** DELETE /api/time-audit/[id] — Delete challenge + cascaded entries */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("DELETE");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const challenge = await prisma.timeAuditChallenge.findFirst({
    where: { id: params.id, userId },
    select: { id: true },
  });
  if (!challenge) return notFound("Challenge not found");

  await prisma.timeAuditChallenge.delete({ where: { id: params.id } });

  return NextResponse.json({ success: true });
}
