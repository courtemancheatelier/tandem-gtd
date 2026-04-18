import { NextResponse } from "next/server";
import { requireAuth, badRequest } from "@/lib/api/auth-helpers";
import { resumeTimer } from "@/lib/services/timer-service";

export async function POST() {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;

  try {
    const session = await resumeTimer(auth.userId);
    return NextResponse.json(session);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to resume timer";
    return badRequest(message);
  }
}
