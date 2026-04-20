import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/auth-helpers";
import { aiWhatNow, AIPermissionError } from "@/lib/ai/api-layer";

/**
 * GET /api/ai/context
 *
 * Returns available next actions filtered by context, energy, and time.
 * This is the "What should I do now?" endpoint.
 *
 * Auth: session + Bearer (read scope)
 *
 * Query params:
 *   contexts - comma-separated context names (e.g. "@home,@errands")
 *   energyLevel - "low" | "medium" | "high"
 *   availableTime - minutes available (number)
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { searchParams } = new URL(req.url);

  const contextsParam = searchParams.get("contexts");
  const energyLevel = searchParams.get("energyLevel") ?? undefined;
  const availableTimeParam = searchParams.get("availableTime");

  const contexts = contextsParam
    ? contextsParam.split(",").map((c) => c.trim()).filter(Boolean)
    : undefined;

  const availableTime = availableTimeParam
    ? parseInt(availableTimeParam, 10)
    : undefined;

  try {
    const result = await aiWhatNow(userId, {
      contexts,
      energyLevel,
      availableTime: availableTime && !isNaN(availableTime)
        ? availableTime
        : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AIPermissionError) {
      return NextResponse.json(
        { error: error.message },
        { status: 403 }
      );
    }
    throw error;
  }
}
