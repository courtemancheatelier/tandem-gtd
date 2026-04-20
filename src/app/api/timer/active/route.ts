import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/auth-helpers";
import { getActiveSession } from "@/lib/services/timer-service";

export async function GET() {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;

  const session = await getActiveSession(auth.userId);
  if (!session) {
    return new NextResponse(null, { status: 204 });
  }

  return NextResponse.json(session);
}
