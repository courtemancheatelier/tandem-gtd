import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest } from "@/lib/api/auth-helpers";
import { createThreadSchema } from "@/lib/validations/thread";
import { createThread } from "@/lib/services/thread-service";
import { getUserTeamIds } from "@/lib/services/team-permissions";

/**
 * GET /api/threads?unresolved=true
 * List threads across the user's team projects.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { searchParams } = new URL(req.url);
  const unresolvedOnly = searchParams.get("unresolved") === "true";

  const teamIds = await getUserTeamIds(userId);
  if (teamIds.length === 0) {
    return NextResponse.json([]);
  }

  // Get all project IDs from the user's teams
  const teamProjects = await prisma.project.findMany({
    where: { teamId: { in: teamIds } },
    select: { id: true },
  });
  const projectIds = teamProjects.map((p) => p.id);
  if (projectIds.length === 0) {
    return NextResponse.json([]);
  }

  const threads = await prisma.thread.findMany({
    where: {
      OR: [
        { projectId: { in: projectIds } },
        { task: { projectId: { in: projectIds } } },
      ],
      ...(unresolvedOnly ? { isResolved: false } : {}),
    },
    select: {
      id: true,
      title: true,
      purpose: true,
      isResolved: true,
      updatedAt: true,
      projectId: true,
      taskId: true,
      project: { select: { id: true, title: true } },
      task: { select: { id: true, projectId: true, project: { select: { id: true, title: true } } } },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  // Normalize project info
  const result = threads.map((t) => ({
    id: t.id,
    title: t.title,
    purpose: t.purpose,
    isResolved: t.isResolved,
    updatedAt: t.updatedAt.toISOString(),
    projectId: t.projectId ?? t.task?.projectId ?? null,
    taskId: t.taskId,
    project: t.project ?? t.task?.project ?? null,
  }));

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();
  const parsed = createThreadSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  try {
    const thread = await createThread(userId, parsed.data, {
      actorType: "USER",
      actorId: userId,
      source: "TEAM_SYNC",
    });

    return NextResponse.json(thread, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Task not found" || error.message === "Project not found") {
        return badRequest(error.message);
      }
      if (error.message.includes("team")) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
    }
    throw error;
  }
}
