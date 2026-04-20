import { NextRequest, NextResponse } from "next/server";
import { requireAuth, forbidden, notFound } from "@/lib/api/auth-helpers";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { getClaimStatus, isEventOwnerOrInvitee } = await import("@/lib/services/event-service");

  try {
    const allowed = await isEventOwnerOrInvitee(params.id, userId);
    if (!allowed) return forbidden();

    const claims = await getClaimStatus(params.id);
    return NextResponse.json(claims);
  } catch (error) {
    if (error instanceof Error && error.message === "Event not found") {
      return notFound("Event not found");
    }
    throw error;
  }
}
