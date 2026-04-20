import { NextRequest, NextResponse } from "next/server";
import { requireAuth, notFound, forbidden } from "@/lib/api/auth-helpers";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; iid: string } }
) {
  const auth = await requireAuth("DELETE");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { revokeInvitation } = await import("@/lib/services/event-service");

  try {
    await revokeInvitation(params.id, params.iid, userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Event not found" || error.message === "Invitation not found")
        return notFound(error.message);
      if (error.message === "Forbidden") return forbidden();
    }
    throw error;
  }
}
