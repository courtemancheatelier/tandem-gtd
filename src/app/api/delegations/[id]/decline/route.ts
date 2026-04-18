import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/auth-helpers";
import { declineDelegationSchema } from "@/lib/validations/delegation";
import { declineDelegation } from "@/lib/services/delegation-service";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("PATCH");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  let reason: string | undefined;
  try {
    const body = await req.json();
    const parsed = declineDelegationSchema.safeParse(body);
    if (parsed.success) {
      reason = parsed.data.reason;
    }
  } catch {
    // No body — that's fine, reason is optional
  }

  try {
    const delegation = await declineDelegation(params.id, userId, reason);
    return NextResponse.json(delegation);
  } catch (error) {
    if (error instanceof Error) {
      const status = error.message.includes("not found") ? 404 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    throw error;
  }
}
