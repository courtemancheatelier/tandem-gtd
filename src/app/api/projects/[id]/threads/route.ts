import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/auth-helpers";
import { listThreads } from "@/lib/services/thread-service";
import { prisma } from "@/lib/prisma";
import { isTeamMember } from "@/lib/services/team-permissions";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;

  // Verify user has access to this project's team
  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { teamId: true },
  });
  if (project?.teamId) {
    const member = await isTeamMember(auth.userId, project.teamId);
    if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const includeResolved = searchParams.get("includeResolved") === "true";

  const threads = await listThreads({
    projectId: params.id,
    includeResolved,
  });

  return NextResponse.json(threads);
}
