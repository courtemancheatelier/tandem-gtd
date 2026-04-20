import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest } from "@/lib/api/auth-helpers";
import { createTaskSchema, updateTaskSchema } from "@/lib/validations/task";
import { createTask, updateTask } from "@/lib/services/task-service";
import { getUserTeamIds } from "@/lib/services/team-permissions";
import { writeTaskEvent } from "@/lib/history/event-writer";
import { VersionConflictError } from "@/lib/version-check";

/**
 * Resolve a date filter value to a Prisma date condition.
 * Supports: "today", "tomorrow", "overdue", or an ISO date string (YYYY-MM-DD).
 */
function resolveDateKeyword(value: string): { gte?: Date; lt?: Date } | null {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

  switch (value) {
    case "today":
      return { gte: startOfToday, lt: startOfTomorrow };
    case "tomorrow": {
      const dayAfter = new Date(startOfTomorrow);
      dayAfter.setDate(dayAfter.getDate() + 1);
      return { gte: startOfTomorrow, lt: dayAfter };
    }
    case "overdue":
      return { lt: startOfToday };
    default: {
      const d = new Date(value);
      if (isNaN(d.getTime())) return null;
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      return { gte: d, lt: next };
    }
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const contextId = searchParams.get("contextId");
  const status = searchParams.get("status");
  const isNextAction = searchParams.get("isNextAction");
  const due = searchParams.get("due");
  const dueBefore = searchParams.get("dueBefore");
  const dueAfter = searchParams.get("dueAfter");
  const scheduled = searchParams.get("scheduled");
  const scheduledBefore = searchParams.get("scheduledBefore");
  const scheduledAfter = searchParams.get("scheduledAfter");

  const where: Record<string, unknown> = { userId };
  if (projectId) where.projectId = projectId;
  if (contextId) where.contextId = contextId;
  if (status) where.status = status;
  if (isNextAction === "true") where.isNextAction = true;

  // Due date filtering
  if (due) {
    const condition = resolveDateKeyword(due);
    if (!condition) return badRequest("Invalid due value. Use: today, tomorrow, overdue, or YYYY-MM-DD.");
    where.dueDate = condition;
  } else if (dueBefore || dueAfter) {
    const dueCond: Record<string, Date> = {};
    if (dueBefore) {
      const d = new Date(dueBefore);
      if (isNaN(d.getTime())) return badRequest("Invalid dueBefore date. Use YYYY-MM-DD.");
      dueCond.lt = d;
    }
    if (dueAfter) {
      const d = new Date(dueAfter);
      if (isNaN(d.getTime())) return badRequest("Invalid dueAfter date. Use YYYY-MM-DD.");
      dueCond.gte = d;
    }
    where.dueDate = dueCond;
  }

  // Scheduled date filtering
  if (scheduled) {
    const condition = resolveDateKeyword(scheduled);
    if (!condition) return badRequest("Invalid scheduled value. Use: today, tomorrow, overdue, or YYYY-MM-DD.");
    where.scheduledDate = condition;
  } else if (scheduledBefore || scheduledAfter) {
    const schedCond: Record<string, Date> = {};
    if (scheduledBefore) {
      const d = new Date(scheduledBefore);
      if (isNaN(d.getTime())) return badRequest("Invalid scheduledBefore date. Use YYYY-MM-DD.");
      schedCond.lt = d;
    }
    if (scheduledAfter) {
      const d = new Date(scheduledAfter);
      if (isNaN(d.getTime())) return badRequest("Invalid scheduledAfter date. Use YYYY-MM-DD.");
      schedCond.gte = d;
    }
    where.scheduledDate = schedCond;
  }

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

  // Warn if the caller passes recurrence-related fields — these belong on
  // POST /api/routines, not on task creation.
  if (body.recurrence || body.cronExpression || body.recurring) {
    return badRequest(
      "Recurrence is not supported on task creation. Use POST /api/routines with a cronExpression field instead."
    );
  }

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
  const { id, version, note, ...updateData } = body;
  if (!id) return badRequest("Task id required");

  const parsed = updateTaskSchema.safeParse(updateData);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  // Extract version from parsed data if it came through Zod, or from body directly
  const expectedVersion = parsed.data.version ?? version;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { version: _v, ...updates } = parsed.data;

  const trimmedNote = typeof note === "string" && note.trim() ? note.trim() : undefined;

  try {
    const task = await updateTask(id, userId, updates, {
      actorType: "USER",
      actorId: userId,
      source: trimmedNote ? "TEAM_SYNC" : "MANUAL",
      message: trimmedNote,
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
