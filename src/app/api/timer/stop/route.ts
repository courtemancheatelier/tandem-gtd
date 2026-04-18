import { NextRequest, NextResponse } from "next/server";
import { requireAuth, badRequest } from "@/lib/api/auth-helpers";
import { stopTimer, discardTimer } from "@/lib/services/timer-service";
import { adjustTimerSchema } from "@/lib/validations/timer";

export async function POST(req: NextRequest) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // Empty body is fine — just stop the timer
  }

  // Check for discard flag
  if (body.discard) {
    try {
      const result = await discardTimer(auth.userId);
      return NextResponse.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to discard timer";
      return badRequest(message);
    }
  }

  // Optional adjusted minutes
  let adjustedMinutes: number | undefined;
  if (body.adjustedMinutes !== undefined) {
    const parsed = adjustTimerSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0].message);
    }
    adjustedMinutes = parsed.data.adjustedMinutes;
  }

  try {
    const result = await stopTimer(auth.userId, adjustedMinutes);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to stop timer";
    return badRequest(message);
  }
}
