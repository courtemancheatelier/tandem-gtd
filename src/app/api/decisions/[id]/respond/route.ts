import { NextRequest, NextResponse } from "next/server";
import { requireAuth, badRequest, notFound } from "@/lib/api/auth-helpers";
import { respondDecisionSchema } from "@/lib/validations/decision";
import { respondToDecision } from "@/lib/services/decision-service";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();
  const parsed = respondDecisionSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  try {
    const response = await respondToDecision(params.id, userId, parsed.data);
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Decision not found") return notFound("Decision not found");
      if (error.message.includes("not open") || error.message.includes("Not a designated")) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
    }
    throw error;
  }
}
