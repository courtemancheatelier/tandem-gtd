import { NextRequest, NextResponse } from "next/server";
import { requireAuth, badRequest } from "@/lib/api/auth-helpers";
import { addTeamMemberSchema } from "@/lib/validations/team";
import { addTeamMember } from "@/lib/services/team-service";
import { getTeamSettings } from "@/lib/api/team-settings";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { teamsEnabled } = await getTeamSettings();
  if (!teamsEnabled) {
    return NextResponse.json({ error: "Teams are disabled" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = addTeamMemberSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  try {
    const member = await addTeamMember(params.id, userId, parsed.data, {
      actorType: "USER",
      actorId: userId,
      source: "MANUAL",
    });
    return NextResponse.json(member, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("admin")) return NextResponse.json({ error: error.message }, { status: 403 });
      if (error.message.includes("not found")) return badRequest(error.message);
      if (error.message.includes("already")) return badRequest(error.message);
    }
    throw error;
  }
}
