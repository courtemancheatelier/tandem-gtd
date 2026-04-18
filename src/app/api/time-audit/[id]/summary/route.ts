import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound } from "@/lib/api/auth-helpers";
import { generateSummary } from "@/lib/time-audit/summary";

/** GET /api/time-audit/[id]/summary — Return cached or fresh summary */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const challenge = await prisma.timeAuditChallenge.findFirst({
    where: { id: params.id, userId },
  });
  if (!challenge) return notFound("Challenge not found");

  const entries = await prisma.timeAuditEntry.findMany({
    where: { challengeId: params.id },
    orderBy: { intervalStart: "asc" },
  });

  if (entries.length < 8) {
    return badRequest("Need at least 8 entries to generate a summary");
  }

  // Return cached summary if available and challenge is completed
  if (challenge.summary && challenge.status === "COMPLETED") {
    return NextResponse.json(challenge.summary);
  }

  // Generate fresh summary
  const summary = generateSummary(challenge, entries);

  // Cache on completed challenges
  if (challenge.status === "COMPLETED") {
    await prisma.timeAuditChallenge.update({
      where: { id: params.id },
      data: { summary: JSON.parse(JSON.stringify(summary)) },
    });
  }

  return NextResponse.json(summary);
}
