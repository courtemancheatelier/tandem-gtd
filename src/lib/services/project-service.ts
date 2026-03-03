import { Project, PrismaClient, TaskStatus, DependencyType, ChildType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { diff, createdDiff } from "@/lib/history/diff";
import { writeProjectEvent } from "@/lib/history/event-writer";
import { CreateProjectInput, UpdateProjectInput } from "@/lib/validations/project";
import { getUserTeamIds } from "./team-permissions";
import { reconcileChildrenOnChildTypeChange, promoteNextChild } from "@/lib/sub-project-sequencing";
import { completeAllProjectTasks, CascadeResult } from "@/lib/cascade";
import type { ActorContext } from "./task-service";
import { VersionConflictError, atomicVersionUpdate } from "@/lib/version-check";

// Transaction client type for Prisma interactive transactions
type TxClient = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/**
 * Create a project with event history tracking.
 * Creates the project in a transaction and writes a CREATED event.
 */
export async function createProject(
  userId: string,
  data: CreateProjectInput,
  actor: ActorContext
): Promise<Project> {
  const project = await prisma.$transaction(async (tx: TxClient) => {
    const created = await tx.project.create({
      data: {
        ...data,
        userId,
      },
      include: {
        area: { select: { id: true, name: true } },
        goal: { select: { id: true, title: true } },
      },
    });

    // Write CREATED event
    const changes = createdDiff(created as unknown as Record<string, unknown>);
    await writeProjectEvent(tx, created.id, "CREATED", changes, actor);

    return created;
  });

  return project;
}

/**
 * Update a project with event history tracking.
 * Gets current state, applies updates in a transaction, computes diff,
 * and writes the appropriate event.
 *
 * When expectedVersion is provided, uses atomic version check (409 on mismatch).
 * When omitted (backward compat), always increments version.
 */
export async function updateProject(
  projectId: string,
  userId: string,
  updates: Partial<UpdateProjectInput>,
  actor: ActorContext,
  expectedVersion?: number
): Promise<{ project: Project; cascade?: CascadeResult }> {
  // Get current state for diffing — check personal or team membership
  const teamIds = await getUserTeamIds(userId);
  const existing = await prisma.project.findFirst({
    where: {
      id: projectId,
      OR: [
        { userId },
        ...(teamIds.length > 0 ? [{ teamId: { in: teamIds } }] : []),
      ],
    },
  });
  if (!existing) throw new Error("Project not found");

  const project = await prisma.$transaction(async (tx: TxClient) => {
    let updated: Project & { area?: { id: string; name: string } | null; goal?: { id: string; title: string } | null };

    if (expectedVersion !== undefined) {
      // Atomic version check: updateMany with WHERE id + version
      const count = await atomicVersionUpdate(tx, "project", projectId, expectedVersion, updates as Record<string, unknown>);
      if (count === 0) {
        const current = await tx.project.findUniqueOrThrow({ where: { id: projectId } });
        throw new VersionConflictError(
          current.version,
          current as unknown as Record<string, unknown>
        );
      }
      // Re-fetch with includes since updateMany doesn't return the record
      updated = await tx.project.findUniqueOrThrow({
        where: { id: projectId },
        include: {
          area: { select: { id: true, name: true } },
          goal: { select: { id: true, title: true } },
        },
      });
    } else {
      // No version check — always increment version
      updated = await tx.project.update({
        where: { id: projectId },
        data: { ...updates, version: { increment: 1 } },
        include: {
          area: { select: { id: true, name: true } },
          goal: { select: { id: true, title: true } },
        },
      });
    }

    // Compute diff and write event
    const changes = diff(
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>
    );
    if (Object.keys(changes).length > 0) {
      // Infer event type from changes
      let eventType: "UPDATED" | "COMPLETED" | "REACTIVATED" = "UPDATED";
      if ("status" in changes) {
        const newStatus = changes.status.new;
        if (newStatus === "COMPLETED") eventType = "COMPLETED";
        else if (changes.status.old === "COMPLETED") eventType = "REACTIVATED";
      }
      await writeProjectEvent(tx, projectId, eventType, changes, actor);
    }

    // Recalculate isNextAction for all active tasks when project type changes
    if (updates.type && updates.type !== existing.type) {
      const activeTasks = await tx.task.findMany({
        where: {
          projectId,
          status: { in: [TaskStatus.NOT_STARTED, TaskStatus.IN_PROGRESS] },
        },
        include: {
          predecessors: {
            where: { type: DependencyType.FINISH_TO_START },
            include: { predecessor: { select: { status: true } } },
          },
        },
        orderBy: { sortOrder: "asc" },
      });

      if (updated.type === "PARALLEL" || updated.type === "SINGLE_ACTIONS") {
        // All unblocked tasks become next actions
        for (const task of activeTasks) {
          const blocked = task.predecessors.some(
            (p) => p.predecessor.status !== TaskStatus.COMPLETED
          );
          await tx.task.update({
            where: { id: task.id },
            data: { isNextAction: !blocked },
          });
        }
      } else if (updated.type === "SEQUENTIAL") {
        // Only the first unblocked task is a next action
        let foundFirst = false;
        for (const task of activeTasks) {
          const blocked = task.predecessors.some(
            (p) => p.predecessor.status !== TaskStatus.COMPLETED
          );
          const shouldBeNext = !blocked && !foundFirst;
          if (shouldBeNext) foundFirst = true;
          await tx.task.update({
            where: { id: task.id },
            data: { isNextAction: shouldBeNext },
          });
        }
      }
    }

    return updated;
  });

  // Reactivation guard: clear purgeScheduledAt when moving from closed to open status
  if (
    updates.status &&
    (existing.status === "COMPLETED" || existing.status === "DROPPED") &&
    updates.status !== "COMPLETED" &&
    updates.status !== "DROPPED" &&
    existing.purgeScheduledAt
  ) {
    await prisma.project.update({
      where: { id: projectId },
      data: { purgeScheduledAt: null },
    });
    await prisma.retentionLog.create({
      data: {
        action: "CANCELLED",
        projectId,
        projectTitle: existing.title,
        actorType: actor.actorType,
        actorId: actor.actorId ?? null,
        details: {
          reason: "reactivated",
          newStatus: updates.status,
          previousPurgeDate: existing.purgeScheduledAt.toISOString(),
        },
      },
    });
  }

  // Handle childType change — reconcile child statuses (outside tx, uses own queries)
  if (updates.childType && updates.childType !== existing.childType) {
    await reconcileChildrenOnChildTypeChange(
      projectId,
      existing.childType as ChildType,
      updates.childType as ChildType
    );
  }

  // If status changed to COMPLETED or DROPPED and project has a parent, promote next sibling
  if (
    (updates.status === "COMPLETED" || updates.status === "DROPPED") &&
    existing.parentProjectId
  ) {
    await promoteNextChild(projectId, existing.parentProjectId, userId, actor);
  }

  // If status changed to COMPLETED, cascade-complete all tasks and child projects
  let cascade: CascadeResult | undefined;
  if (updates.status === "COMPLETED") {
    cascade = {
      promotedTasks: [],
      completedProjects: [],
      completedTasks: [],
      updatedGoals: [],
      completedMilestones: [],
      updatedRollups: [],
      activatedProjects: [],
      recycledTasks: [],
    };
    await completeAllProjectTasks(projectId, userId, cascade);
  }

  return { project, cascade };
}

/**
 * Delete a project with event history tracking.
 * Writes a deletion event before removing the project.
 */
export async function deleteProject(
  projectId: string,
  userId: string,
  actor: ActorContext
): Promise<void> {
  const teamIds = await getUserTeamIds(userId);
  const existing = await prisma.project.findFirst({
    where: {
      id: projectId,
      OR: [
        { userId },
        ...(teamIds.length > 0 ? [{ teamId: { in: teamIds } }] : []),
      ],
    },
  });
  if (!existing) throw new Error("Project not found");

  await prisma.$transaction(async (tx: TxClient) => {
    // Write ARCHIVED event before deletion (captures the final state)
    const changes = {
      status: { old: existing.status, new: "DELETED" },
    };
    await writeProjectEvent(tx, projectId, "ARCHIVED", changes, actor);

    // Delete all tasks belonging to this project
    await tx.task.deleteMany({ where: { projectId } });

    // Delete all sub-projects (recursive via cascade)
    await tx.project.deleteMany({ where: { parentProjectId: projectId } });

    await tx.project.delete({ where: { id: projectId } });
  });
}
