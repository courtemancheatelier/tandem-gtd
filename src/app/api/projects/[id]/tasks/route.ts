import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound, badRequest } from "@/lib/api/auth-helpers";
import { createTaskSchema } from "@/lib/validations/task";
import { createTask } from "@/lib/services/task-service";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const project = await prisma.project.findFirst({
    where: { id: params.id, userId },
  });
  if (!project) return notFound("Project not found");

  const tasks = await prisma.task.findMany({
    where: { projectId: params.id, userId },
    orderBy: { sortOrder: "asc" },
    include: {
      context: { select: { id: true, name: true, color: true } },
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
  });

  return NextResponse.json(tasks);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const project = await prisma.project.findFirst({
    where: { id: params.id, userId },
  });
  if (!project) return notFound("Project not found");

  const body = await req.json();
  const parsed = createTaskSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  try {
    // Service layer handles: project reactivation, isNextAction, dependencies, CREATED event
    const task = await createTask(
      userId,
      { ...parsed.data, projectId: params.id },
      { actorType: "USER", actorId: userId, source: "MANUAL" }
    );

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Project not found") {
      return badRequest("Project not found");
    }
    throw error;
  }
}
