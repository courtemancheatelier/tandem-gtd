import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sweepMissedRoutinesForUser } from "@/lib/services/recurring-missed-service";

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * POST /api/cron/recurring-missed
 *
 * Legacy external-cron entry point. The real work has been moved into
 * `sweepMissedRoutinesForUser` (see docs/specs/INTERNAL_SCHEDULER_RECURRING_MISSED.md).
 * Each authenticated user is now swept lazily on their next visit to a
 * routine endpoint, so this cron is no longer required for correctness.
 *
 * It is kept in place during the transition: it iterates every user and
 * calls the helper with `force: true`, so an existing external scheduler
 * will continue to function. Remove this route once the lazy path is
 * proven in production.
 *
 * Protected by CRON_SECRET bearer token.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const users = await prisma.user.findMany({ select: { id: true } });

  let simpleMissed = 0;
  let windowedMissed = 0;
  for (const { id } of users) {
    const result = await sweepMissedRoutinesForUser(id, { force: true });
    simpleMissed += result.simpleMissed;
    windowedMissed += result.windowedMissed;
  }

  return NextResponse.json({
    users: users.length,
    missed: simpleMissed,
    protocols: { missed: windowedMissed },
  });
}
