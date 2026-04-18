import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound, badRequest } from "@/lib/api/auth-helpers";
import { addDependencySchema } from "@/lib/validations/task";
import { writeTaskEvent } from "@/lib/history/event-writer";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const task = await prisma.task.findFirst({
    where: { id: params.id, userId },
  });
  if (!task) return notFound("Task not found");

  const [predecessors, successors] = await Promise.all([
    prisma.taskDependency.findMany({
      where: { successorId: params.id },
      include: {
        predecessor: { select: { id: true, title: true, status: true } },
      },
    }),
    prisma.taskDependency.findMany({
      where: { predecessorId: params.id },
      include: {
        successor: { select: { id: true, title: true, status: true } },
      },
    }),
  ]);

  return NextResponse.json({ predecessors, successors });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const task = await prisma.task.findFirst({
    where: { id: params.id, userId },
  });
  if (!task) return notFound("Task not found");

  const body = await req.json();
  const parsed = addDependencySchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  const { predecessorId, type, lagMinutes } = parsed.data;

  // Prevent circular dependencies
  if (predecessorId === params.id) {
    return badRequest("Task cannot depend on itself");
  }

  // Verify predecessor exists and belongs to user
  const predecessor = await prisma.task.findFirst({
    where: { id: predecessorId, userId },
  });
  if (!predecessor) return notFound("Predecessor task not found");

  // Check for duplicate
  const existing = await prisma.taskDependency.findUnique({
    where: {
      predecessorId_successorId: {
        predecessorId,
        successorId: params.id,
      },
    },
  });
  if (existing) return badRequest("Dependency already exists");

  const dep = await prisma.taskDependency.create({
    data: {
      predecessorId,
      successorId: params.id,
      type,
      lagMinutes,
    },
    include: {
      predecessor: { select: { id: true, title: true, status: true } },
      successor: { select: { id: true, title: true, status: true } },
    },
  });

  // Write DEPENDENCY_ADDED event
  await writeTaskEvent(
    prisma,
    params.id,
    "DEPENDENCY_ADDED",
    {
      dependency: {
        old: null,
        new: { predecessorId, predecessorTitle: predecessor.title, type },
      },
    },
    { actorType: "USER", actorId: userId, source: "MANUAL" }
  );

  // If this is a FS dependency and predecessor is not complete, mark successor as not next action
  if (
    type === "FINISH_TO_START" &&
    predecessor.status !== "COMPLETED"
  ) {
    await prisma.task.update({
      where: { id: params.id },
      data: { isNextAction: false, version: { increment: 1 } },
    });
  }

  return NextResponse.json(dep, { status: 201 });
}
