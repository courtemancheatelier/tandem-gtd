import { Task, PrismaClient, TaskStatus, ProjectStatus, ProjectType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { diff, createdDiff } from "@/lib/history/diff";
import {
  writeTaskEvent,
  inferTaskEventType,
} from "@/lib/history/event-writer";
import { computeNextAction, onTaskComplete, CascadeResult } from "@/lib/cascade";
import { recycleRecurringTask } from "@/lib/recurring";
import { CreateTaskInput, UpdateTaskInput } from "@/lib/validations/task";
import { getUserTeamIds } from "@/lib/services/team-permissions";
import { VersionConflictError, atomicVersionUpdate } from "@/lib/version-check";

// Transaction client type for Prisma interactive transactions
type TxClient = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export interface ActorContext {
  actorType: "USER" | "SYSTEM" | "AI";
  actorId?: string | null;
  source?: "MANUAL" | "MCP" | "AI_EMBED" | "CASCADE" | "SCHEDULER" | "API" | "IMPORT";
  triggeredBy?: string;
  message?: string;
}

/**
 * Find a task accessible to the user — either owned directly or in a
 * team project where they are a member.
 */
async function findTaskForUser(taskId: string, userId: string): Promise<Task | null> {
  // Fast path: direct ownership
  const own = await prisma.task.findFirst({ where: { id: taskId, userId } });
  if (own) return own;

  // Check team project membership
  const teamIds = await getUserTeamIds(userId);
  if (teamIds.length === 0) return null;

  return prisma.task.findFirst({
    where: {
      id: taskId,
      project: { teamId: { in: teamIds } },
    },
  });
}

/**
 * Create a task with event history tracking.
 * Computes isNextAction via cascade logic, creates the task in a transaction,
 * and writes a CREATED event.
 */
export async function createTask(
  userId: string,
  data: CreateTaskInput & { predecessorIds?: string[] },
  actor: ActorContext
): Promise<Task> {
  const { predecessorIds, ...taskData } = data;

  // Standalone task (no project) is always a next action
  let isNextAction = true;
  if (taskData.projectId) {
    // Find project by ownership or team membership
    const teamIds = await getUserTeamIds(userId);
    const project = await prisma.project.findFirst({
      where: {
        id: taskData.projectId,
        OR: [
          { userId },
          ...(teamIds.length > 0 ? [{ teamId: { in: teamIds } }] : []),
        ],
      },
    });
    if (!project) throw new Error("Project not found");

    // Reactivate completed/dropped projects when a new task is added
    if (project.status === ProjectStatus.COMPLETED || project.status === ProjectStatus.DROPPED) {
      await prisma.project.update({
        where: { id: project.id },
        data: { status: ProjectStatus.ACTIVE, completedAt: null, version: { increment: 1 } },
      });
    }

    isNextAction = await computeNextAction({
      projectId: project.id,
      projectType: project.type,
      predecessorIds,
      userId,
    });
  }

  const task = await prisma.$transaction(async (tx: TxClient) => {
    const created = await tx.task.create({
      data: {
        ...taskData,
        userId,
        isNextAction,
        scheduledDate: taskData.scheduledDate
          ? new Date(taskData.scheduledDate)
          : undefined,
        dueDate: taskData.dueDate ? new Date(taskData.dueDate) : undefined,
      },
      include: {
        project: { select: { id: true, title: true, type: true } },
        context: { select: { id: true, name: true, color: true } },
      },
    });

    // Create explicit dependency records
    if (predecessorIds?.length) {
      await Promise.all(
        predecessorIds.map((predId) =>
          tx.taskDependency.create({
            data: {
              predecessorId: predId,
              successorId: created.id,
              type: "FINISH_TO_START",
              lagMinutes: 0,
            },
          })
        )
      );
    }

    // Write CREATED event
    const changes = createdDiff(created as unknown as Record<string, unknown>);
    await writeTaskEvent(tx, created.id, "CREATED", changes, actor);

    // Re-fetch with predecessors included
    const taskWithDeps = await tx.task.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        project: { select: { id: true, title: true, type: true } },
        context: { select: { id: true, name: true, color: true } },
        predecessors: {
          include: {
            predecessor: { select: { id: true, title: true, status: true } },
          },
        },
      },
    });

    return taskWithDeps;
  });

  return task;
}

/**
 * Update a task with event history tracking.
 * Gets current state, applies updates in a transaction, computes diff,
 * infers the event type, and writes the event.
 *
 * When expectedVersion is provided, uses atomic version check (409 on mismatch).
 * When omitted (backward compat), always increments version.
 */
export async function updateTask(
  taskId: string,
  userId: string,
  updates: Partial<UpdateTaskInput>,
  actor: ActorContext,
  expectedVersion?: number
): Promise<Task> {
  // Get current state for diffing (supports team project tasks)
  const existing = await findTaskForUser(taskId, userId);
  if (!existing) throw new Error("Task not found");

  const data: Record<string, unknown> = { ...updates };
  if (updates.scheduledDate) data.scheduledDate = new Date(updates.scheduledDate);
  if (updates.dueDate) data.dueDate = new Date(updates.dueDate);
  if (updates.scheduledDate === null) data.scheduledDate = null;
  if (updates.dueDate === null) data.dueDate = null;

  const task = await prisma.$transaction(async (tx: TxClient) => {
    let updated: Task & { project?: { id: string; title: string; type: string } | null; context?: { id: string; name: string; color: string | null } | null };

    if (expectedVersion !== undefined) {
      // Atomic version check: updateMany with WHERE id + version
      const count = await atomicVersionUpdate(tx, "task", taskId, expectedVersion, data);
      if (count === 0) {
        // Re-fetch current state for the error response
        const current = await tx.task.findUniqueOrThrow({ where: { id: taskId } });
        throw new VersionConflictError(
          current.version,
          current as unknown as Record<string, unknown>
        );
      }
      // Re-fetch with includes since updateMany doesn't return the record
      updated = await tx.task.findUniqueOrThrow({
        where: { id: taskId },
        include: {
          project: { select: { id: true, title: true, type: true } },
          context: { select: { id: true, name: true, color: true } },
        },
      });
    } else {
      // No version check — always increment version
      updated = await tx.task.update({
        where: { id: taskId },
        data: { ...data, version: { increment: 1 } },
        include: {
          project: { select: { id: true, title: true, type: true } },
          context: { select: { id: true, name: true, color: true } },
        },
      });
    }

    // Compute diff and write event
    const changes = diff(
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>
    );
    if (Object.keys(changes).length > 0) {
      const eventType = inferTaskEventType(changes, false);
      await writeTaskEvent(tx, taskId, eventType, changes, actor);
    }

    return updated;
  });

  return task;
}

/**
 * Complete a task with event history tracking and cascade processing.
 * Marks task complete, writes COMPLETED event, runs cascade, and writes
 * CASCADE events for promoted tasks with triggeredBy linking.
 *
 * When expectedVersion is provided, verifies the version before proceeding.
 */
export async function completeTask(
  taskId: string,
  userId: string,
  actor: ActorContext,
  expectedVersion?: number
): Promise<{ task: Task; cascade: CascadeResult }> {
  // Get current state for the completion event (supports team project tasks)
  const existing = await findTaskForUser(taskId, userId);
  if (!existing) throw new Error("Task not found");

  // Version check before proceeding (cascade handles its own version increments)
  if (expectedVersion !== undefined && existing.version !== expectedVersion) {
    throw new VersionConflictError(
      existing.version,
      existing as unknown as Record<string, unknown>
    );
  }

  // Write the COMPLETED event in a transaction
  const completionEventId = await prisma.$transaction(async (tx: TxClient) => {
    // We record the completion event before onTaskComplete runs,
    // so we can use its ID as triggeredBy for cascade events
    const completionChanges = diff(
      existing as unknown as Record<string, unknown>,
      {
        ...(existing as unknown as Record<string, unknown>),
        status: TaskStatus.COMPLETED,
        isNextAction: false,
        completedAt: new Date().toISOString(),
      }
    );

    const event = await writeTaskEvent(
      tx,
      taskId,
      "COMPLETED",
      completionChanges,
      actor
    );

    return event?.id ?? null;
  });

  // Run cascade (which performs its own DB writes)
  const cascadeResult = await onTaskComplete(taskId, userId);

  // Fetch the completed task
  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    include: {
      project: { select: { id: true, title: true, type: true } },
      context: { select: { id: true, name: true, color: true } },
    },
  });

  // Write CASCADE events for promoted tasks
  if (cascadeResult.promotedTasks.length > 0 && completionEventId) {
    for (const promoted of cascadeResult.promotedTasks) {
      const promotedChanges = {
        isNextAction: { old: false, new: true },
      };

      await writeTaskEvent(prisma, promoted.id, "PROMOTED", promotedChanges, {
        actorType: "SYSTEM",
        source: "CASCADE",
        triggeredBy: completionEventId,
        message: `Promoted after completion of task ${taskId}`,
      });
    }
  }

  // Write project COMPLETED events for auto-completed projects
  if (cascadeResult.completedProjects.length > 0 && completionEventId) {
    const { writeProjectEvent } = await import("@/lib/history/event-writer");
    for (const project of cascadeResult.completedProjects) {
      const projectChanges = {
        status: { old: "ACTIVE", new: "COMPLETED" },
      };
      await writeProjectEvent(
        prisma,
        project.id,
        "COMPLETED",
        projectChanges,
        {
          actorType: "SYSTEM",
          source: "CASCADE",
          triggeredBy: completionEventId,
          message: `All tasks completed`,
        }
      );
    }
  }

  // Recycle recurring task if this task was generated from a template
  if (task.recurringTemplateId) {
    // Reset skip streak on completion (SHE pencil marks cleared)
    await prisma.recurringTemplate.update({
      where: { id: task.recurringTemplateId },
      data: { skipStreak: 0 },
    });

    const recycled = await recycleRecurringTask(task.recurringTemplateId);
    if (recycled) {
      cascadeResult.recycledTasks.push(recycled);
    }
  }

  return { task, cascade: cascadeResult };
}

/**
 * Reorder tasks within a project.
 * Updates sortOrder to match the given ID order and recalculates
 * isNextAction for SEQUENTIAL projects.
 */
export async function reorderProjectTasks(
  projectId: string,
  taskIds: string[],
  projectType: ProjectType
): Promise<void> {
  await prisma.$transaction(async (tx: TxClient) => {
    // Verify all task IDs belong to this project
    const tasks = await tx.task.findMany({
      where: { id: { in: taskIds }, projectId },
      select: { id: true, status: true },
    });
    if (tasks.length !== taskIds.length) {
      throw new Error("Some task IDs do not belong to this project");
    }

    // Update sortOrder for each task
    for (let i = 0; i < taskIds.length; i++) {
      await tx.task.update({
        where: { id: taskIds[i] },
        data: { sortOrder: i, version: { increment: 1 } },
      });
    }

    // Recalculate isNextAction for sequential projects
    if (projectType === ProjectType.SEQUENTIAL) {
      // Build a set of active task IDs for quick lookup
      const statusMap = new Map(tasks.map((t) => [t.id, t.status]));

      // Find task IDs with incomplete FS predecessors
      const deps = await tx.taskDependency.findMany({
        where: {
          successorId: { in: taskIds },
          type: "FINISH_TO_START",
        },
        include: {
          predecessor: { select: { id: true, status: true } },
        },
      });
      const blockedIds = new Set<string>();
      for (const dep of deps) {
        if (dep.predecessor.status !== TaskStatus.COMPLETED) {
          blockedIds.add(dep.successorId);
        }
      }

      // Walk tasks in new order; first eligible active task gets isNextAction
      let foundNext = false;
      for (const id of taskIds) {
        const status = statusMap.get(id);
        const isActive =
          status !== TaskStatus.COMPLETED && status !== TaskStatus.DROPPED;
        if (!isActive) continue;

        const shouldBeNext = !foundNext && !blockedIds.has(id);
        if (shouldBeNext) foundNext = true;

        await tx.task.update({
          where: { id },
          data: { isNextAction: shouldBeNext },
        });
      }
    }
  });
}
