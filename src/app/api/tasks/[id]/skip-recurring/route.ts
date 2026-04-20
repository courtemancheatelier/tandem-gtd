import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound, badRequest } from "@/lib/api/auth-helpers";
import { recycleRecurringTask } from "@/lib/recurring";

/**
 * POST /api/tasks/[id]/skip-recurring
 * Drops the current recurring task (no completion cascade) and generates
 * the next occurrence via recycleRecurringTask().
 * Works for both simple routines (no windows) and can be used for any routine-linked task.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  // Optional note for skip reason (e.g. "rain", "sick")
  let note: string | undefined;
  try {
    const body = await req.json();
    note = typeof body.note === "string" ? body.note.trim() : undefined;
  } catch {
    // No body is fine — note is optional
  }

  const task = await prisma.task.findFirst({
    where: { id: params.id, userId },
  });

  if (!task) return notFound("Task not found");
  if (!task.routineId) {
    return badRequest("Task is not linked to a routine");
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
        reason: "SKIPPED",
        ...(note ? { note } : {}),
      },
      source: "MANUAL",
      message: note ? `Skipped: ${note}` : "Skipped recurring task",
    },
  });

  // Increment skip streak (SHE pencil marks)
  await prisma.routine.update({
    where: { id: task.routineId },
    data: { skipStreak: { increment: 1 } },
  });

  // Generate next occurrence (pass scheduledDate so overdue skips don't jump ahead)
  const recycled = await recycleRecurringTask(task.routineId, task.scheduledDate);

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
