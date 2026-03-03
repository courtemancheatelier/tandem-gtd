import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest } from "@/lib/api/auth-helpers";
import { createTaskSchema, updateTaskSchema } from "@/lib/validations/task";
import { createTask, updateTask } from "@/lib/services/task-service";
import { getUserTeamIds } from "@/lib/services/team-permissions";
import { writeTaskEvent } from "@/lib/history/event-writer";
import { VersionConflictError } from "@/lib/version-check";

export async function GET(req: NextRequest) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const contextId = searchParams.get("contextId");
  const status = searchParams.get("status");
  const isNextAction = searchParams.get("isNextAction");

  const where: Record<string, unknown> = { userId };
  if (projectId) where.projectId = projectId;
  if (contextId) where.contextId = contextId;
  if (status) where.status = status;
  if (isNextAction === "true") where.isNextAction = true;

  const tasks = await prisma.task.findMany({
    where,
    include: {
      project: { select: { id: true, title: true, type: true, status: true } },
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
    orderBy: [{ isNextAction: "desc" }, { sortOrder: "asc" }],
  });

  return NextResponse.json(tasks);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();
  const parsed = createTaskSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  try {
    const task = await createTask(userId, parsed.data, {
      actorType: "USER",
      actorId: userId,
      source: "MANUAL",
    });

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Project not found") {
      return badRequest("Project not found");
    }
    throw error;
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth("DELETE");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return badRequest("Task id required");

  // Find by ownership or team project membership
  let task = await prisma.task.findFirst({ where: { id, userId } });
  if (!task) {
    const teamIds = await getUserTeamIds(userId);
    if (teamIds.length > 0) {
      task = await prisma.task.findFirst({
        where: { id, project: { teamId: { in: teamIds } } },
      });
    }
  }
  if (!task) return badRequest("Task not found");

  // Write ARCHIVED event before deletion so history is captured
  await writeTaskEvent(
    prisma,
    id,
    "ARCHIVED",
    { status: { old: task.status, new: "DELETED" } },
    { actorType: "USER", actorId: userId, source: "MANUAL" }
  );

  await prisma.task.delete({ where: { id } });

  return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth("PATCH");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();
  const { id, version, ...updateData } = body;
  if (!id) return badRequest("Task id required");

  const parsed = updateTaskSchema.safeParse(updateData);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  // Extract version from parsed data if it came through Zod, or from body directly
  const expectedVersion = parsed.data.version ?? version;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { version: _v, ...updates } = parsed.data;

  try {
    const task = await updateTask(id, userId, updates, {
      actorType: "USER",
      actorId: userId,
      source: "MANUAL",
    }, expectedVersion);

    return NextResponse.json(task);
  } catch (error) {
    if (error instanceof VersionConflictError) {
      return NextResponse.json(
        { error: "CONFLICT", message: error.message, currentVersion: error.currentVersion, currentState: error.currentState },
        { status: 409 }
      );
    }
    if (error instanceof Error && error.message === "Task not found") {
      return badRequest("Task not found");
    }
    throw error;
  }
}
