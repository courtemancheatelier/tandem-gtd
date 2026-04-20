import { NextRequest, NextResponse } from "next/server";
import { requireAuth, badRequest, notFound, forbidden } from "@/lib/api/auth-helpers";
import { createInvitationSchema } from "@/lib/validations/event";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();
  const parsed = createInvitationSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  const { createInvitations } = await import("@/lib/services/event-service");

  try {
    const invitations = await createInvitations(
      params.id,
      userId,
      parsed.data.emails,
      parsed.data.role
    );
    return NextResponse.json(invitations, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Event not found") return notFound("Event not found");
      if (error.message === "Forbidden") return forbidden();
    }
    throw error;
  }
}
