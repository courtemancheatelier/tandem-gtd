import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api/auth-helpers";
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

const taskWhere = {
  status: { notIn: ["COMPLETED" as const, "DROPPED" as const] },
};

const taskOrderBy = { sortOrder: "asc" as const };

export async function GET(req: NextRequest) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { searchParams } = new URL(req.url);
  const includeSomeday = searchParams.get("includeSomeday") === "true";
  const areaId = searchParams.get("areaId");
  const teamId = searchParams.get("teamId");

  const teamIds = await getUserTeamIds(userId);

  const where: Record<string, unknown> = {
    OR: [
      { userId },
      ...(teamIds.length > 0 ? [{ teamId: { in: teamIds } }] : []),
    ],
    parentProjectId: null, // Only root-level projects
    status: { in: includeSomeday ? ["ACTIVE", "ON_HOLD", "SOMEDAY_MAYBE"] : ["ACTIVE", "ON_HOLD"] },
  };

  if (!includeSomeday) {
    where.isSomedayMaybe = false;
  }

  if (areaId) {
    where.areaId = areaId;
  }

  if (teamId === "personal") {
    where.teamId = null;
  } else if (teamId) {
    where.teamId = teamId;
  }

  const projects = await prisma.project.findMany({
    where,
    include: {
      area: { select: { id: true, name: true } },
      team: { select: { id: true, name: true, icon: true } },
      tasks: {
        where: taskWhere,
        select: taskSelect,
        orderBy: taskOrderBy,
      },
      childProjects: {
        where: { status: { notIn: ["COMPLETED" as const, "DROPPED" as const] } },
        include: {
          area: { select: { id: true, name: true } },
          team: { select: { id: true, name: true, icon: true } },
          tasks: {
            where: taskWhere,
            select: taskSelect,
            orderBy: taskOrderBy,
          },
          childProjects: {
            where: { status: { notIn: ["COMPLETED" as const, "DROPPED" as const] } },
            include: {
              area: { select: { id: true, name: true } },
              team: { select: { id: true, name: true, icon: true } },
              tasks: {
                where: taskWhere,
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
    orderBy: { sortOrder: "asc" },
  });

  // Build response with task counts rolling up from children
  function buildNode(project: typeof projects[number] & { childProjects?: unknown[]; _count: { tasks: number } }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = project as any;
    const ownTotal = p._count.tasks;
    const ownActive = p.tasks?.length ?? 0;
    const ownCompleted = Math.max(0, ownTotal - ownActive);

    const children = (p.childProjects || []).map(buildNode);

    // Roll up task counts from all children
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
      startDate: p.startDate,
      endDate: p.endDate,
      isSomedayMaybe: p.isSomedayMaybe,
      version: p.version,
      area: p.area,
      team: p.team || null,
      taskCounts,
      tasks: p.tasks || [],
      childProjects: children,
    };
  }

  const result = projects.map(buildNode);

  return NextResponse.json(result);
}
