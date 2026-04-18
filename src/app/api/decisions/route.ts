import { NextRequest, NextResponse } from "next/server";
import { requireAuth, badRequest } from "@/lib/api/auth-helpers";
import { createDecisionSchema } from "@/lib/validations/decision";
import { createDecision } from "@/lib/services/decision-service";

export async function POST(req: NextRequest) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();
  const parsed = createDecisionSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  try {
    const decision = await createDecision(userId, parsed.data, {
      actorType: "USER",
      actorId: userId,
      source: "TEAM_SYNC",
    });

    return NextResponse.json(decision, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("not found")) return badRequest(error.message);
      if (error.message.includes("team")) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
    }
    throw error;
  }
}
