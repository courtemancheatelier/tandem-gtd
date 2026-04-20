import { NextRequest, NextResponse } from "next/server";
import { requireAuth, badRequest } from "@/lib/api/auth-helpers";
import { startTimerSchema } from "@/lib/validations/timer";
import { startTimer } from "@/lib/services/timer-service";

export async function POST(req: NextRequest) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;

  let body;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  const parsed = startTimerSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  try {
    const result = await startTimer(auth.userId, parsed.data.taskId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start timer";
    return badRequest(message);
  }
}
