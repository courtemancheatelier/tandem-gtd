import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api/auth-helpers";

/** GET /api/time-audit/active — Return active/paused challenge or 204 */
export async function GET() {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const challenge = await prisma.timeAuditChallenge.findFirst({
    where: { userId, status: { in: ["ACTIVE", "PAUSED"] } },
    include: {
      _count: { select: { entries: true } },
    },
  });

  if (!challenge) {
    return new NextResponse(null, { status: 204 });
  }

  return NextResponse.json(challenge);
}
