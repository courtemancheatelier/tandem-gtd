import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound } from "@/lib/api/auth-helpers";

interface TreeNode {
  id: string;
  title: string;
  status: string;
  type: string;
  depth: number;
  rollupProgress: number | null;
  rollupStatus: string | null;
  taskCounts: { total: number; completed: number };
  children: TreeNode[];
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const project = await prisma.project.findFirst({
    where: { id: params.id, userId },
    include: {
      tasks: { select: { status: true } },
      childProjects: {
        include: {
          tasks: { select: { status: true } },
          childProjects: {
            include: {
              tasks: { select: { status: true } },
            },
            orderBy: { sortOrder: "asc" },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!project) return notFound("Project not found");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function buildNode(p: any): TreeNode {
    const totalTasks = p.tasks?.length ?? 0;
    const completedTasks = p.tasks?.filter(
      (t: { status: string }) => t.status === "COMPLETED" || t.status === "DROPPED"
    ).length ?? 0;

    return {
      id: p.id,
      title: p.title,
      status: p.status,
      type: p.type,
      depth: p.depth,
      rollupProgress: p.rollupProgress,
      rollupStatus: p.rollupStatus,
      taskCounts: { total: totalTasks, completed: completedTasks },
      children: (p.childProjects ?? []).map(buildNode),
    };
  }

  return NextResponse.json(buildNode(project));
}
