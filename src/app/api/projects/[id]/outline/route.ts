import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound } from "@/lib/api/auth-helpers";
import { getUserTeamIds } from "@/lib/services/team-permissions";

const taskSelect = {
  id: true,
  title: true,
  status: true,
  isNextAction: true,
  sortOrder: true,
  estimatedMins: true,
  energyLevel: true,
  dueDate: true,
  version: true,
  context: { select: { id: true, name: true, color: true } },
};

const taskOrderBy = { sortOrder: "asc" as const };

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
      tasks: {
        select: taskSelect,
        orderBy: taskOrderBy,
      },
      childProjects: {
        where: { status: { notIn: ["COMPLETED" as const, "DROPPED" as const] } },
        include: {
          tasks: {
            select: taskSelect,
            orderBy: taskOrderBy,
          },
          childProjects: {
            where: { status: { notIn: ["COMPLETED" as const, "DROPPED" as const] } },
            include: {
              tasks: {
                select: taskSelect,
                orderBy: taskOrderBy,
              },
              _count: { select: { tasks: true } },
            },
            orderBy: { sortOrder: "asc" },
          },
          _count: { select: { tasks: true } },
        },
        orderBy: { sortOrder: "asc" },
      },
      _count: { select: { tasks: true } },
    },
  });

  if (!project) return notFound("Project not found");

  // Build response with task counts rolling up from children
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function buildNode(p: any) {
    const ownTotal = p._count.tasks;
    const ownActive = p.tasks?.length ?? 0;
    const ownCompleted = Math.max(0, ownTotal - ownActive);

    const children = (p.childProjects || []).map(buildNode);

    let rollupTotal = ownTotal;
    let rollupCompleted = ownCompleted;
    for (const child of children) {
      rollupTotal += child.taskCounts.total;
      rollupCompleted += child.taskCounts.completed;
    }

    const taskCounts = {
      total: rollupTotal,
      active: rollupTotal - rollupCompleted,
      completed: rollupCompleted,
    };

    return {
      id: p.id,
      title: p.title,
      status: p.status,
      type: p.type,
      childType: p.childType,
      sortOrder: p.sortOrder,
      rollupProgress: p.rollupProgress,
      version: p.version,
      taskCounts,
      tasks: p.tasks || [],
      childProjects: children,
    };
  }

  return NextResponse.json(buildNode(project));
}
