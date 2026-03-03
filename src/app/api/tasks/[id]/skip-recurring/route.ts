import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound, badRequest } from "@/lib/api/auth-helpers";
import { recycleRecurringTask } from "@/lib/recurring";

/**
 * POST /api/tasks/[id]/skip-recurring
 * Drops the current recurring task (no completion cascade) and generates
 * the next occurrence via recycleRecurringTask().
 */
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
  if (!task.recurringTemplateId) {
    return badRequest("Task is not linked to a recurring template");
  }
  if (task.status === "COMPLETED" || task.status === "DROPPED") {
    return badRequest("Task is already completed or dropped");
  }

  // Drop the current task (no cascade)
  await prisma.task.update({
    where: { id: params.id },
    data: {
      status: "DROPPED",
      isNextAction: false,
      version: { increment: 1 },
    },
  });

  // Write DROPPED event
  await prisma.taskEvent.create({
    data: {
      taskId: params.id,
      eventType: "STATUS_CHANGED",
      actorType: "USER",
      actorId: userId,
      changes: {
        status: { old: task.status, new: "DROPPED" },
      },
      source: "MANUAL",
      message: "Skipped recurring task",
    },
  });

  // Increment skip streak (SHE pencil marks)
  await prisma.recurringTemplate.update({
    where: { id: task.recurringTemplateId },
    data: { skipStreak: { increment: 1 } },
  });

  // Generate next occurrence
  const recycled = await recycleRecurringTask(task.recurringTemplateId);

  return NextResponse.json({
    success: true,
    skippedTaskId: params.id,
    recycledTask: recycled
      ? {
          id: recycled.id,
          title: recycled.title,
          nextDue: recycled.nextDue.toISOString(),
        }
      : null,
  });
}
