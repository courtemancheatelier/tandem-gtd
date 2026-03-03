import { NextRequest, NextResponse } from "next/server";
import { requireAuth, badRequest } from "@/lib/api/auth-helpers";
import { updateTeamMemberSchema } from "@/lib/validations/team";
import { updateTeamMember, removeTeamMember } from "@/lib/services/team-service";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; userId: string } }
) {
  const auth = await requireAuth("PATCH");
  if (auth instanceof NextResponse) return auth;
  const { userId: currentUserId } = auth;

  const body = await req.json();
  const parsed = updateTeamMemberSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  try {
    const member = await updateTeamMember(
      params.id,
      currentUserId,
      params.userId,
      parsed.data,
      {
        actorType: "USER",
        actorId: currentUserId,
        source: "MANUAL",
      }
    );
    return NextResponse.json(member);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("admin")) return NextResponse.json({ error: error.message }, { status: 403 });
      if (error.message.includes("not found")) return badRequest(error.message);
    }
    throw error;
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; userId: string } }
) {
  const auth = await requireAuth("DELETE");
  if (auth instanceof NextResponse) return auth;
  const { userId: currentUserId } = auth;

  try {
    await removeTeamMember(params.id, currentUserId, params.userId, {
      actorType: "USER",
      actorId: currentUserId,
      source: "MANUAL",
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("admin")) return NextResponse.json({ error: error.message }, { status: 403 });
      if (error.message.includes("last")) return badRequest(error.message);
      if (error.message.includes("Not a team member")) return badRequest(error.message);
    }
    throw error;
  }
}
