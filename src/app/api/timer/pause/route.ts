import { NextResponse } from "next/server";
import { requireAuth, badRequest } from "@/lib/api/auth-helpers";
import { pauseTimer } from "@/lib/services/timer-service";

export async function POST() {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;

  try {
    const session = await pauseTimer(auth.userId);
    return NextResponse.json(session);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to pause timer";
    return badRequest(message);
  }
}
