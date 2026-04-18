import { NextRequest, NextResponse } from "next/server";
import { runNotificationTick } from "@/lib/services/notification-tick-service";

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * POST /api/cron/notifications
 *
 * Legacy external-cron entry point. The real work has been moved to
 * `runNotificationTick` and is now driven by the in-process scheduler
 * (`src/lib/scheduler/notification-scheduler.ts`), started from
 * `src/instrumentation.ts` on server boot.
 *
 * This route is kept in place during the transition: an existing
 * external scheduler hitting it will continue to function. Remove once
 * the in-process path is proven on beta.
 *
 * Spec: docs/specs/INTERNAL_SCHEDULER_NOTIFICATIONS.md
 *
 * Protected by CRON_SECRET bearer token.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runNotificationTick(new Date());
  return NextResponse.json(result);
}
