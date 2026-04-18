import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAuth,
  notFound,
  badRequest,
} from "@/lib/api/auth-helpers";
import { getUserTeamIds } from "@/lib/services/team-permissions";

/**
 * POST /api/tasks/[id]/uncomplete
 * Reopens a completed/dropped task by setting status back to NOT_STARTED.
 * For sequential projects, recalculates isNextAction so the reopened task
 * becomes the next action if it precedes the current one in sort order.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  // Find task — support both personal and team project tasks
  let task = await prisma.task.findFirst({
    where: { id: params.id, userId },
    include: { project: { select: { id: true, title: true, type: true, teamId: true } } },
  });
  if (!task) {
    const teamIds = await getUserTeamIds(userId);
    if (teamIds.length > 0) {
      task = await prisma.task.findFirst({
        where: {
          id: params.id,
          project: { teamId: { in: teamIds } },
        },
        include: { project: { select: { id: true, title: true, type: true, teamId: true } } },
      });
    }
  }
  if (!task) return notFound("Task not found");

  if (task.status !== "COMPLETED" && task.status !== "DROPPED") {
    return badRequest("Task is not completed or dropped");
  }

  const updated = await prisma.$transaction(async (tx) => {
    // For sequential projects, recalculate isNextAction
    let isNextAction = true;
    if (task.project?.type === "SEQUENTIAL") {
      // Find the current next action in this project
      const currentNextAction = await tx.task.findFirst({
        where: {
          projectId: task.projectId!,
          isNextAction: true,
          status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
        },
        select: { id: true, sortOrder: true },
      });

      if (currentNextAction) {
        // Reopened task becomes next action if it precedes the current one
        if (task.sortOrder < currentNextAction.sortOrder) {
          isNextAction = true;
          // Demote the current next action
          await tx.task.update({
            where: { id: currentNextAction.id },
            data: { isNextAction: false },
          });
        } else {
          // Current next action has lower sort order — keep it
          isNextAction = false;
        }
      }
      // If no current next action exists, the reopened task becomes it (isNextAction stays true)
    }

    const reopened = await tx.task.update({
      where: { id: params.id },
      data: {
        status: "NOT_STARTED",
        completedAt: null,
        isNextAction,
      },
      include: {
        project: { select: { id: true, title: true, type: true } },
        context: { select: { id: true, name: true, color: true } },
      },
    });

    // Write REOPENED event
    await tx.taskEvent.create({
      data: {
        taskId: params.id,
        eventType: "REOPENED",
        actorType: "USER",
        actorId: userId,
        changes: {
          status: { old: task.status, new: "NOT_STARTED" },
          completedAt: { old: task.completedAt?.toISOString() ?? null, new: null },
          isNextAction: { old: task.isNextAction, new: isNextAction },
        },
        source: "MANUAL",
      },
    });

    return reopened;
  });

  return NextResponse.json({ success: true, task: updated });
}
