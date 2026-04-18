import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/auth-helpers";
import { getTaskSessions } from "@/lib/services/timer-service";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;

  const { id: taskId } = await params;
  const result = await getTaskSessions(auth.userId, taskId);
  return NextResponse.json(result);
}
