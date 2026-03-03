import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound, badRequest } from "@/lib/api/auth-helpers";
import { recalculateProjectRollups } from "@/lib/cascade";
import { getUserTeamIds } from "@/lib/services/team-permissions";
import { TaskStatus, ProjectStatus, GoalStatus } from "@prisma/client";

const undoCompleteSchema = z.object({
  previousStatus: z.enum(["NOT_STARTED", "IN_PROGRESS", "WAITING"]),
  deleteRecycledTasks: z.array(z.string()).default([]),
  cascade: z
    .object({
      demoteTasks: z.array(z.string()).default([]),
      reopenProjects: z.array(z.string()).default([]),
      revertGoals: z
        .array(
          z.object({
            id: z.string(),
            previousProgress: z.number(),
            previousStatus: z.string(),
          })
        )
        .default([]),
    })
    .optional(),
});

/**
 * POST /api/tasks/[id]/undo-complete
 * Reverses a task completion including full cascade reversal:
 * - Reopens the task
 * - Demotes tasks that were promoted by the cascade
 * - Reopens projects that were auto-completed
 * - Reverts goal progress/status to previous values
 * - Recalculates rollups for affected projects
 * - Writes a REOPENED event
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();
  const parsed = undoCompleteSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid request");
  }
  const { previousStatus, deleteRecycledTasks, cascade } = parsed.data;

  // Find the task (support personal + team tasks)
  let task = await prisma.task.findFirst({
    where: { id: params.id, userId },
    include: {
      project: {
        select: { id: true, title: true, type: true, teamId: true },
      },
    },
  });
  if (!task) {
    const teamIds = await getUserTeamIds(userId);
    if (teamIds.length > 0) {
      task = await prisma.task.findFirst({
        where: {
          id: params.id,
          project: { teamId: { in: teamIds } },
        },
        include: {
          project: {
            select: { id: true, title: true, type: true, teamId: true },
          },
        },
      });
    }
  }
  if (!task) return notFound("Task not found");

  // Only undo if the task is still COMPLETED (race condition safety)
  if (task.status !== TaskStatus.COMPLETED) {
    return badRequest("Task is not completed — cannot undo");
  }

  await prisma.$transaction(async (tx) => {
    // 1. Reopen the task
    await tx.task.update({
      where: { id: params.id },
      data: {
        status: previousStatus as TaskStatus,
        completedAt: null,
        isNextAction: true,
      },
    });

    // 2. Demote tasks that were promoted by the cascade
    if (cascade?.demoteTasks.length) {
      for (const taskId of cascade.demoteTasks) {
        // Only demote if still a next action (race condition safety)
        const t = await tx.task.findUnique({
          where: { id: taskId },
          select: { isNextAction: true, status: true },
        });
        if (
          t &&
          t.isNextAction &&
          t.status !== TaskStatus.COMPLETED &&
          t.status !== TaskStatus.DROPPED
        ) {
          await tx.task.update({
            where: { id: taskId },
            data: { isNextAction: false },
          });
        }
      }
    }

    // 3. Reopen auto-completed projects
    if (cascade?.reopenProjects.length) {
      for (const projectId of cascade.reopenProjects) {
        const p = await tx.project.findUnique({
          where: { id: projectId },
          select: { status: true },
        });
        if (p?.status === ProjectStatus.COMPLETED) {
          await tx.project.update({
            where: { id: projectId },
            data: { status: ProjectStatus.ACTIVE, completedAt: null },
          });
        }
      }
    }

    // 4. Revert goal progress/status
    if (cascade?.revertGoals.length) {
      for (const goal of cascade.revertGoals) {
        await tx.goal.update({
          where: { id: goal.id },
          data: {
            progress: goal.previousProgress,
            status: goal.previousStatus as GoalStatus,
          },
        });
      }
    }

    // 5. Delete auto-recycled tasks from recurring completion
    if (deleteRecycledTasks.length > 0) {
      // Delete events first (FK constraint), then tasks
      await tx.taskEvent.deleteMany({
        where: { taskId: { in: deleteRecycledTasks } },
      });
      await tx.task.deleteMany({
        where: { id: { in: deleteRecycledTasks } },
      });
    }

    // 6. Write REOPENED event
    await tx.taskEvent.create({
      data: {
        taskId: params.id,
        eventType: "REOPENED",
        actorType: "USER",
        actorId: userId,
        changes: {
          status: { old: "COMPLETED", new: previousStatus },
          completedAt: {
            old: task.completedAt?.toISOString() ?? null,
            new: null,
          },
          isNextAction: { old: false, new: true },
        },
        source: "MANUAL",
        message: "Undo task completion",
      },
    });
  });

  // 7. Recalculate rollups for affected projects (outside transaction for performance)
  const projectIds = new Set<string>();
  if (task.projectId) projectIds.add(task.projectId);
  if (cascade?.reopenProjects.length) {
    for (const pid of cascade.reopenProjects) {
      // Get parent project to recalculate its rollups
      const proj = await prisma.project.findUnique({
        where: { id: pid },
        select: { parentProjectId: true },
      });
      if (proj?.parentProjectId) projectIds.add(proj.parentProjectId);
    }
  }
  for (const pid of Array.from(projectIds)) {
    await recalculateProjectRollups(pid);
  }

  return NextResponse.json({ success: true });
}
