import { NextRequest, NextResponse } from "next/server";
import { requireAuth, notFound } from "@/lib/api/auth-helpers";
import { moveToReview } from "@/lib/services/decision-service";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const decision = await moveToReview(params.id, userId);
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
