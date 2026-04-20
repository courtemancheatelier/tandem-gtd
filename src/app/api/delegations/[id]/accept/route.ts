import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/auth-helpers";
import { acceptDelegation } from "@/lib/services/delegation-service";

export async function PATCH(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("PATCH");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const delegation = await acceptDelegation(params.id, userId);
    return NextResponse.json(delegation);
  } catch (error) {
    if (error instanceof Error) {
      const status = error.message.includes("not found") ? 404 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    throw error;
  }
}
