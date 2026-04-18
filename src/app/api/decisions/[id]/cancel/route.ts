import { NextRequest, NextResponse } from "next/server";
import { requireAuth, notFound } from "@/lib/api/auth-helpers";
import { cancelDecisionSchema } from "@/lib/validations/decision";
import { cancelDecision } from "@/lib/services/decision-service";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json().catch(() => ({}));
  const parsed = cancelDecisionSchema.safeParse(body);

  try {
    const decision = await cancelDecision(params.id, userId, parsed.success ? parsed.data.reason : undefined);
    return NextResponse.json(decision);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("not found")) return notFound(error.message);
      if (error.message.includes("Only") || error.message.includes("cannot")) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
    }
    throw error;
  }
}
