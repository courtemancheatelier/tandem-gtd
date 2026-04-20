import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/auth-helpers";
import { listPendingDecisions } from "@/lib/services/decision-service";

export async function GET() {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const decisions = await listPendingDecisions(userId);
  return NextResponse.json(decisions);
}
