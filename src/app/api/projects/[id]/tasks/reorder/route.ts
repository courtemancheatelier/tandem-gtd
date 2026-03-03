import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound, badRequest } from "@/lib/api/auth-helpers";
import { reorderTasksSchema } from "@/lib/validations/task";
import { reorderProjectTasks } from "@/lib/services/task-service";
import { getUserTeamIds } from "@/lib/services/team-permissions";
import { ProjectType } from "@prisma/client";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("PATCH");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  // Find project — owned by user or team member
  const teamIds = await getUserTeamIds(userId);
  const project = await prisma.project.findFirst({
    where: {
      id: params.id,
      OR: [
        { userId },
        ...(teamIds.length > 0 ? [{ teamId: { in: teamIds } }] : []),
      ],
    },
  });
  if (!project) return notFound("Project not found");

  const body = await req.json();
  const parsed = reorderTasksSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  try {
    await reorderProjectTasks(
      params.id,
      parsed.data.taskIds,
      project.type as ProjectType
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Reorder failed";
    return badRequest(message);
  }

  return NextResponse.json({ success: true });
}
