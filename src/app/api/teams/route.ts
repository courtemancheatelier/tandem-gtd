import { NextRequest, NextResponse } from "next/server";
import { requireAuth, badRequest } from "@/lib/api/auth-helpers";
import { createTeamSchema } from "@/lib/validations/team";
import { getUserTeams, createTeam } from "@/lib/services/team-service";
import { getTeamSettings } from "@/lib/api/team-settings";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { teamsEnabled } = await getTeamSettings();

  if (!teamsEnabled) {
    return NextResponse.json({ teams: [], teamsEnabled: false });
  }

  const teams = await getUserTeams(userId);
  return NextResponse.json({ teams, teamsEnabled: true });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { teamsEnabled, teamsAdminOnly } = await getTeamSettings();

  if (!teamsEnabled) {
    return NextResponse.json({ error: "Teams are disabled" }, { status: 403 });
  }

  if (teamsAdminOnly) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    });
    if (!user?.isAdmin) {
      return NextResponse.json(
        { error: "Only administrators can create teams" },
        { status: 403 }
      );
    }
  }

  const body = await req.json();
  const parsed = createTeamSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  const team = await createTeam(userId, parsed.data, {
    actorType: "USER",
    actorId: userId,
    source: "MANUAL",
  });

  return NextResponse.json(team, { status: 201 });
}
