import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound, badRequest } from "@/lib/api/auth-helpers";
import { updateProjectSchema } from "@/lib/validations/project";
import { getUserTeamIds, isTeamAdmin } from "@/lib/services/team-permissions";
import { VersionConflictError } from "@/lib/version-check";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const teamIds = await getUserTeamIds(userId);

  const project = await prisma.project.findFirst({
    where: {
      id: params.id,
      OR: [
        { userId },
        ...(teamIds.length > 0 ? [{ teamId: { in: teamIds } }] : []),
      ],
    },
    include: {
      area: { select: { id: true, name: true } },
      goal: { select: { id: true, title: true, horizon: true } },
      parentProject: { select: { id: true, title: true } },
      team: { select: { id: true, name: true, icon: true } },
      tasks: {
        orderBy: { sortOrder: "asc" },
        include: {
          context: { select: { id: true, name: true, color: true } },
          assignedTo: { select: { id: true, name: true } },
          predecessors: {
            include: {
              predecessor: { select: { id: true, title: true, status: true } },
            },
          },
          successors: {
            include: {
              successor: { select: { id: true, title: true, status: true } },
            },
          },
        },
      },
      childProjects: {
        select: { id: true, title: true, status: true, type: true, rollupProgress: true, sortOrder: true, version: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!project) return notFound("Project not found");
  return NextResponse.json(project);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("PATCH");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();
  const parsed = updateProjectSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  const { updateProject } = await import("@/lib/services/project-service");

  // Extract version from parsed data for optimistic concurrency
  const expectedVersion = parsed.data.version;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { version: _v, ...updates } = parsed.data;

  try {
    const { project, cascade } = await updateProject(params.id, userId, updates, {
      actorType: "USER",
      actorId: userId,
      source: "MANUAL",
    }, expectedVersion);

    return NextResponse.json({ ...project, cascade });
  } catch (error) {
    if (error instanceof VersionConflictError) {
      return NextResponse.json(
        { error: "CONFLICT", message: error.message, currentVersion: error.currentVersion, currentState: error.currentState },
        { status: 409 }
      );
    }
    if (error instanceof Error && error.message === "Project not found") {
      return notFound("Project not found");
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

  // For team projects, only team admin or project creator can delete
  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { userId: true, teamId: true },
  });
  if (!project) return notFound("Project not found");

  if (project.userId !== userId) {
    // Not the creator — must be team admin
    if (!project.teamId) return notFound("Project not found");
    const admin = await isTeamAdmin(userId, project.teamId);
    if (!admin) return NextResponse.json({ error: "Only the project creator or team admin can delete" }, { status: 403 });
  }

  const { deleteProject } = await import("@/lib/services/project-service");
  try {
    await deleteProject(params.id, userId, {
      actorType: "USER",
      actorId: userId,
      source: "MANUAL",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Project not found") {
      return notFound("Project not found");
    }
    throw error;
  }
}
