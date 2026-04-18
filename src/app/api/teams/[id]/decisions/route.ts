import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/auth-helpers";
import { listDecisionsByTeam } from "@/lib/services/decision-service";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;

  try {
    const decisions = await listDecisionsByTeam(params.id, auth.userId);
    return NextResponse.json(decisions);
  } catch (error) {
    if (error instanceof Error && error.message.includes("Not a member")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw error;
  }
}
