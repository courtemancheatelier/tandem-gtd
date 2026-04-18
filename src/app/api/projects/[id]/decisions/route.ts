import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/auth-helpers";
import { listDecisionsByProject } from "@/lib/services/decision-service";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;

  try {
    const decisions = await listDecisionsByProject(params.id, auth.userId);
    return NextResponse.json(decisions);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("Not a member")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (error.message.includes("not part of a team")) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    throw error;
  }
}
