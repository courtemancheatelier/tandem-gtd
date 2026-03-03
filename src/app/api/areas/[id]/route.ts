import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound, badRequest } from "@/lib/api/auth-helpers";
import { updateAreaSchema } from "@/lib/validations/area";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const area = await prisma.area.findFirst({
    where: { id: params.id, userId },
    include: {
      projects: {
        orderBy: { sortOrder: "asc" },
        include: {
          _count: {
            select: { tasks: true },
          },
        },
      },
      goals: {
        orderBy: { title: "asc" },
      },
    },
  });

  if (!area) return notFound("Area not found");

  // Enrich projects with task status counts
  const projectsWithCounts = await Promise.all(
    area.projects.map(async (project) => {
      const taskCounts = await prisma.task.groupBy({
        by: ["status"],
        where: { projectId: project.id, userId },
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { projects, ...areaRest } = area;
  return NextResponse.json({
    ...areaRest,
    projects: projectsWithCounts,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("PATCH");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const existing = await prisma.area.findFirst({
    where: { id: params.id, userId },
  });
  if (!existing) return notFound("Area not found");

  const body = await req.json();
  const parsed = updateAreaSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  const area = await prisma.area.update({
    where: { id: params.id },
    data: parsed.data,
  });

  return NextResponse.json(area);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("DELETE");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const existing = await prisma.area.findFirst({
    where: { id: params.id, userId },
  });
  if (!existing) return notFound("Area not found");

  await prisma.area.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
