import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound, badRequest } from "@/lib/api/auth-helpers";
import { updateTeamSchema } from "@/lib/validations/team";
import { isTeamMember } from "@/lib/services/team-permissions";
import { updateTeam, deleteTeam } from "@/lib/services/team-service";
import { getTeamSettings } from "@/lib/api/team-settings";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { teamsEnabled } = await getTeamSettings();
  if (!teamsEnabled) {
    return NextResponse.json({ error: "Teams are disabled" }, { status: 403 });
  }

  const member = await isTeamMember(userId, params.id);
  if (!member) return notFound("Team not found");

  const team = await prisma.team.findUnique({
    where: { id: params.id },
    include: {
      members: {
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { joinedAt: "asc" },
      },
      projects: {
        select: {
          id: true,
          title: true,
          status: true,
          type: true,
          _count: { select: { tasks: true } },
        },
        orderBy: { updatedAt: "desc" },
      },
      events: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          actor: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!team) return notFound("Team not found");
  return NextResponse.json(team);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("PATCH");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { teamsEnabled } = await getTeamSettings();
  if (!teamsEnabled) {
    return NextResponse.json({ error: "Teams are disabled" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = updateTeamSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  try {
    const team = await updateTeam(params.id, userId, parsed.data, {
      actorType: "USER",
      actorId: userId,
      source: "MANUAL",
    });
    return NextResponse.json(team);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Team not found") return notFound("Team not found");
      if (error.message.includes("admin")) return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("DELETE");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { teamsEnabled } = await getTeamSettings();
  if (!teamsEnabled) {
    return NextResponse.json({ error: "Teams are disabled" }, { status: 403 });
  }

  try {
    await deleteTeam(params.id, userId, {
      actorType: "USER",
      actorId: userId,
      source: "MANUAL",
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Team not found") return notFound("Team not found");
      if (error.message.includes("admin")) return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }
}
