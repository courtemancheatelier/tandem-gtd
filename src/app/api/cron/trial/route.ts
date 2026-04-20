import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/api/auth-helpers";
import { runTrialTick } from "@/lib/services/trial-tick-service";

/**
 * POST /api/cron/trial
 *
 * Legacy external-cron entry point. The real work has been moved to
 * `runTrialTick` and is now driven by the in-process scheduler's daily
 * slot. This route is kept as a thin wrapper during the transition.
 *
 * Spec: docs/specs/INTERNAL_SCHEDULER_TRIAL.md
 *
 * Protected by CRON_SECRET bearer token.
 */
export async function POST(req: NextRequest) {
  if (!verifyCronSecret(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runTrialTick(new Date());
  return NextResponse.json(result);
}
