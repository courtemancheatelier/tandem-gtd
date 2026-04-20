import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest } from "@/lib/api/auth-helpers";
import { createProjectSchema } from "@/lib/validations/project";
import { getUserTeamIds } from "@/lib/services/team-permissions";
import { isTeamMember } from "@/lib/services/team-permissions";

export async function GET(req: NextRequest) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const areaId = searchParams.get("areaId");
  const someday = searchParams.get("someday");

  const teamIds = await getUserTeamIds(userId);

  // Show personal projects + team projects
  const where: Record<string, unknown> = {
    OR: [
      { userId },
      ...(teamIds.length > 0 ? [{ teamId: { in: teamIds } }] : []),
    ],
  };
  if (status) where.status = status;
  if (areaId) where.areaId = areaId;
  if (someday === "true") where.isSomedayMaybe = true;
  if (someday === "false") where.isSomedayMaybe = false;

  const projects = await prisma.project.findMany({
    where,
    include: {
      area: { select: { id: true, name: true } },
      goal: { select: { id: true, title: true } },
      parentProject: { select: { id: true, title: true } },
      team: { select: { id: true, name: true, icon: true } },
      _count: {
        select: {
          tasks: true,
        },
      },
    },
    orderBy: { sortOrder: "asc" },
  });

  // Add task status counts
  const projectsWithCounts = await Promise.all(
    projects.map(async (project) => {
      const taskCounts = await prisma.task.groupBy({
        by: ["status"],
        where: { projectId: project.id },
        _count: true,
      });
      const counts = {
        total: project._count.tasks,
        completed: 0,
        active: 0,
      };
      for (const tc of taskCounts) {
        if (tc.status === "COMPLETED") counts.completed = tc._count;
        else if (tc.status !== "DROPPED") counts.active += tc._count;
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { _count, ...rest } = project;
      return { ...rest, taskCounts: counts };
    })
  );

  return NextResponse.json(projectsWithCounts);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();
  const parsed = createProjectSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  // If assigning to a team, verify membership
  if (parsed.data.teamId) {
    const member = await isTeamMember(userId, parsed.data.teamId);
    if (!member) {
      return badRequest("You are not a member of this team");
    }
  }

  const { createProject } = await import("@/lib/services/project-service");
  const project = await createProject(userId, parsed.data, {
    actorType: "USER",
    actorId: userId,
    source: "MANUAL",
  });

  return NextResponse.json(project, { status: 201 });
}
