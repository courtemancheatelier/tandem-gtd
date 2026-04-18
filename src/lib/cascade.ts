import { prisma } from "@/lib/prisma";
import { ProjectType, TaskStatus, ProjectStatus, DependencyType, ChildType, DelegationStatus } from "@prisma/client";
import { promoteNextChild } from "@/lib/sub-project-sequencing";
import { writeTaskEvent } from "@/lib/history/event-writer";

export interface CascadeResult {
  promotedTasks: Array<{ id: string; title: string }>;
  completedProjects: Array<{ id: string; title: string }>;
  completedTasks: Array<{ id: string; title: string }>;
  updatedGoals: Array<{ id: string; title: string; progress: number; previousProgress: number; previousStatus: string }>;
  completedMilestones: Array<{ id: string; title: string }>;
  updatedRollups: Array<{ id: string; title: string; progress: number }>;
  activatedProjects: Array<{ id: string; title: string }>;
  recycledTasks: Array<{ id: string; title: string; nextDue: Date }>;
}

/**
 * Determine if a new task should be a next action based on project type and dependencies.
 */
export async function computeNextAction({
  projectId,
  projectType,
  predecessorIds,
  userId,
}: {
  projectId: string;
  projectType: ProjectType;
  predecessorIds?: string[];
  userId: string;
}): Promise<boolean> {
  // If task has incomplete FS predecessors, it can't be a next action
  if (predecessorIds?.length) {
    const incompletePreds = await prisma.task.count({
      where: {
        id: { in: predecessorIds },
        status: { not: TaskStatus.COMPLETED },
      },
    });
    if (incompletePreds > 0) return false;
  }

  switch (projectType) {
    case "PARALLEL":
    case "SINGLE_ACTIONS":
      // All tasks are next actions in parallel/single-action projects
      return true;

    case "SEQUENTIAL": {
      // Only the first non-completed task is a next action
      const existingNextAction = await prisma.task.findFirst({
        where: {
          projectId,
          userId,
          isNextAction: true,
          status: { in: [TaskStatus.NOT_STARTED, TaskStatus.IN_PROGRESS] },
        },
      });
      if (existingNextAction) return false;

      // Delegation guard: if any earlier task has an active delegation, block
      const activeDelegated = await prisma.task.findFirst({
        where: {
          projectId,
          status: { not: TaskStatus.COMPLETED },
          delegation: {
            status: { in: [DelegationStatus.PENDING, DelegationStatus.VIEWED, DelegationStatus.ACCEPTED] },
          },
        },
      });
      return !activeDelegated;
    }

    default:
      return false;
  }
}

/**
 * THE HEART: Called when a task is completed.
 * Finds unblocked tasks, promotes them, checks project completion, updates goal progress.
 * Handles dependency types (FS/SS/FF/SF), lag times, milestones, and rollups.
 */
export async function onTaskComplete(
  taskId: string,
  userId: string
): Promise<CascadeResult> {
  const result: CascadeResult = {
    promotedTasks: [],
    completedProjects: [],
    completedTasks: [],
    updatedGoals: [],
    completedMilestones: [],
    updatedRollups: [],
    activatedProjects: [],
    recycledTasks: [],
  };

  // Mark task as completed
  const completedTask = await prisma.task.update({
    where: { id: taskId },
    data: {
      status: TaskStatus.COMPLETED,
      isNextAction: false,
      completedAt: new Date(),
      version: { increment: 1 },
    },
    include: {
      project: true,
    },
  });

  // 1. Find all successor dependencies where this task is the predecessor
  const successorDeps = await prisma.taskDependency.findMany({
    where: { predecessorId: taskId },
    include: {
      successor: {
        include: {
          predecessors: {
            include: {
              predecessor: { select: { id: true, status: true } },
            },
          },
          project: { select: { id: true, type: true, status: true } },
        },
      },
    },
  });

  // 2. Promote tasks based on dependency type
  for (const dep of successorDeps) {
    const successor = dep.successor;

    // Skip already completed/dropped tasks
    if (
      successor.status === TaskStatus.COMPLETED ||
      successor.status === TaskStatus.DROPPED
    ) {
      continue;
    }

    // Only handle FS and FF on task completion
    // SS and SF are handled on task *start*, not here
    if (
      dep.type !== DependencyType.FINISH_TO_START &&
      dep.type !== DependencyType.FINISH_TO_FINISH
    ) {
      continue;
    }

    // Check if all predecessors of the same type are complete
    const relevantPreds = successor.predecessors.filter(
      (p) => p.type === dep.type
    );
    const allRelevantComplete = relevantPreds.every(
      (p) =>
        p.predecessor.status === TaskStatus.COMPLETED ||
        p.predecessorId === taskId
    );

    // For FS deps, also check that all other FS deps are complete
    if (dep.type === DependencyType.FINISH_TO_START) {
      const fsPreds = successor.predecessors.filter(
        (p) => p.type === DependencyType.FINISH_TO_START
      );
      const allFsComplete = fsPreds.every(
        (p) =>
          p.predecessor.status === TaskStatus.COMPLETED ||
          p.predecessorId === taskId
      );
      if (!allFsComplete) continue;
    } else if (!allRelevantComplete) {
      continue;
    }

    if (successor.project?.status !== ProjectStatus.ACTIVE) continue;

    // Handle lag time
    if (dep.lagMinutes > 0 && completedTask.completedAt) {
      const scheduledDate = new Date(
        completedTask.completedAt.getTime() + dep.lagMinutes * 60000
      );
      await prisma.task.update({
        where: { id: successor.id },
        data: { scheduledDate, version: { increment: 1 } },
      });
    }

    // Check if this is a milestone — auto-complete if all predecessors done
    if (successor.isMilestone) {
      const allPredsComplete = successor.predecessors.every(
        (p) =>
          p.predecessor.status === TaskStatus.COMPLETED ||
          p.predecessorId === taskId
      );
      if (allPredsComplete) {
        await prisma.task.update({
          where: { id: successor.id },
          data: {
            status: TaskStatus.COMPLETED,
            isNextAction: false,
            completedAt: new Date(),
            version: { increment: 1 },
          },
        });
        result.completedMilestones.push({
          id: successor.id,
          title: successor.title,
        });
        continue; // Don't also promote — it's now completed
      }
    }

    // For sequential projects, only promote if no other next action exists
    if (successor.project?.type === "SEQUENTIAL") {
      const existingNext = await prisma.task.findFirst({
        where: {
          projectId: successor.project.id,
          isNextAction: true,
          status: { in: [TaskStatus.NOT_STARTED, TaskStatus.IN_PROGRESS] },
          id: { not: taskId },
        },
      });
      if (existingNext) continue;
    }

    await prisma.task.update({
      where: { id: successor.id },
      data: { isNextAction: true, version: { increment: 1 } },
    });
    result.promotedTasks.push({ id: successor.id, title: successor.title });
  }

  // 3. For sequential projects, promote the next task in order
  if (completedTask.project?.type === "SEQUENTIAL") {
    const nextTask = await prisma.task.findFirst({
      where: {
        projectId: completedTask.project.id,
        userId,
        status: TaskStatus.NOT_STARTED,
        isNextAction: false,
        // Must not have incomplete FS predecessors
        predecessors: {
          every: {
            OR: [
              { predecessor: { status: TaskStatus.COMPLETED } },
              { type: { not: DependencyType.FINISH_TO_START } },
            ],
          },
        },
        // Delegation guard: skip tasks with active delegations
        OR: [
          { delegation: null },
          {
            delegation: {
              status: { in: [DelegationStatus.COMPLETED, DelegationStatus.DECLINED, DelegationStatus.RECALLED] },
            },
          },
        ],
      },
      orderBy: { sortOrder: "asc" },
    });

    if (nextTask) {
      // Check no other next action already exists
      const existingNext = await prisma.task.findFirst({
        where: {
          projectId: completedTask.project.id,
          isNextAction: true,
          status: { in: [TaskStatus.NOT_STARTED, TaskStatus.IN_PROGRESS] },
        },
      });

      if (
        !existingNext &&
        !result.promotedTasks.some((t) => t.id === nextTask.id)
      ) {
        await prisma.task.update({
          where: { id: nextTask.id },
          data: { isNextAction: true, version: { increment: 1 } },
        });
        result.promotedTasks.push({ id: nextTask.id, title: nextTask.title });
      }
    }
  }

  // 4. Check if project is now complete, and cascade upward through parents
  if (completedTask.projectId) {
    await checkProjectCompletion(completedTask.projectId, userId, result);
  }

  // 5. Increment cascade event counter for tandem-manage behavioral tracking
  if (result.promotedTasks.length > 0) {
    await prisma.user.update({
      where: { id: userId },
      data: { cascadeEventCount: { increment: 1 } },
    });
  }

  return result;
}

/**
 * Check if a project should auto-complete (all own tasks done + no active children).
 * If it completes, recursively check parent project too.
 */
async function checkProjectCompletion(
  projectId: string,
  userId: string,
  result: CascadeResult
): Promise<void> {
  const remainingTasks = await prisma.task.count({
    where: {
      projectId,
      userId,
      status: {
        notIn: [TaskStatus.COMPLETED, TaskStatus.DROPPED],
      },
    },
  });

  const activeChildProjects = await prisma.project.count({
    where: {
      parentProjectId: projectId,
      status: {
        notIn: [ProjectStatus.COMPLETED, ProjectStatus.DROPPED],
      },
    },
  });

  if (remainingTasks > 0 || activeChildProjects > 0) return;

  const project = await prisma.project.update({
    where: { id: projectId },
    data: {
      status: ProjectStatus.COMPLETED,
      completedAt: new Date(),
      version: { increment: 1 },
    },
  });
  result.completedProjects.push({ id: project.id, title: project.title });

  // Update goal progress if project has a goal
  if (project.goalId) {
    // Fetch current goal state before updating (needed for undo)
    const currentGoal = await prisma.goal.findUnique({
      where: { id: project.goalId },
      select: { id: true, title: true, progress: true, status: true },
    });

    const goalProjects = await prisma.project.findMany({
      where: { goalId: project.goalId, userId },
    });
    const completedCount = goalProjects.filter(
      (p) => p.status === ProjectStatus.COMPLETED
    ).length;
    const progress = Math.round(
      (completedCount / goalProjects.length) * 100
    );

    const goal = await prisma.goal.update({
      where: { id: project.goalId },
      data: {
        progress,
        ...(progress === 100 ? { status: "ACHIEVED" } : {}),
      },
    });
    result.updatedGoals.push({
      id: goal.id,
      title: goal.title,
      progress,
      previousProgress: currentGoal?.progress ?? 0,
      previousStatus: currentGoal?.status ?? "NOT_STARTED",
    });
  }

  // Recalculate parent rollups, promote next child, and check if parent should also complete
  if (project.parentProjectId) {
    const rollupResults = await recalculateProjectRollups(
      project.parentProjectId
    );
    result.updatedRollups.push(...rollupResults);

    // Promote next child in sequential parent
    const activated = await promoteNextChild(
      projectId,
      project.parentProjectId,
      userId,
      { actorType: "SYSTEM", actorId: userId, source: "CASCADE" }
    );
    if (activated) {
      result.activatedProjects.push(activated);
    }

    // Recursively check parent project completion
    await checkProjectCompletion(project.parentProjectId, userId, result);
  }
}

/**
 * Recalculate rollup progress and status for a project and its ancestors.
 */
export async function recalculateProjectRollups(
  projectId: string
): Promise<Array<{ id: string; title: string; progress: number }>> {
  const results: Array<{ id: string; title: string; progress: number }> = [];

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      tasks: { select: { status: true } },
      childProjects: {
        select: {
          id: true,
          rollupProgress: true,
          status: true,
          tasks: { select: { status: true } },
        },
      },
    },
  });

  if (!project) return results;

  // Calculate progress from own tasks
  const totalTasks = project.tasks.length;
  const completedTasks = project.tasks.filter(
    (t) =>
      t.status === TaskStatus.COMPLETED || t.status === TaskStatus.DROPPED
  ).length;
  const ownProgress =
    totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  // Calculate progress from children
  const childCount = project.childProjects.length;
  let childProgress = 0;
  if (childCount > 0) {
    const totalChildProgress = project.childProjects.reduce(
      (sum, c) => sum + (c.rollupProgress ?? 0),
      0
    );
    childProgress = totalChildProgress / childCount;
  }

  // Weighted average: own tasks and children contribute equally
  const rollupProgress =
    totalTasks > 0 && childCount > 0
      ? (ownProgress + childProgress) / 2
      : totalTasks > 0
        ? ownProgress
        : childProgress;

  // Compute worst-case rollup status from children
  // For sequential parents, ON_HOLD children are expected (waiting their turn) — skip them
  let rollupStatus: ProjectStatus = project.status;
  const statusChildren = project.childType === ChildType.SEQUENTIAL
    ? project.childProjects.filter((c) => c.status !== ProjectStatus.ON_HOLD)
    : project.childProjects;
  for (const child of statusChildren) {
    if (child.status === ProjectStatus.ON_HOLD) {
      rollupStatus = ProjectStatus.ON_HOLD;
    }
  }

  await prisma.project.update({
    where: { id: projectId },
    data: {
      rollupProgress: Math.round(rollupProgress * 100) / 100,
      rollupStatus,
      version: { increment: 1 },
    },
  });

  results.push({
    id: project.id,
    title: project.title,
    progress: Math.round(rollupProgress),
  });

  // Recurse to parent
  if (project.parentProjectId) {
    const parentResults = await recalculateProjectRollups(
      project.parentProjectId
    );
    results.push(...parentResults);
  }

  return results;
}

/**
 * Called when a task transitions from WAITING to IN_PROGRESS (e.g. blocker thread resolved).
 * Handles Start-to-Start dependencies and ensures the task is properly promoted as next action.
 */
export async function runCascade(
  taskId: string,
  userId: string
): Promise<CascadeResult> {
  const result: CascadeResult = {
    promotedTasks: [],
    completedProjects: [],
    completedTasks: [],
    updatedGoals: [],
    completedMilestones: [],
    updatedRollups: [],
    activatedProjects: [],
    recycledTasks: [],
  };

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: true },
  });
  if (!task) return result;

  // 1. Handle Start-to-Start dependencies: successor can start when predecessor starts
  const ssDeps = await prisma.taskDependency.findMany({
    where: { predecessorId: taskId, type: DependencyType.START_TO_START },
    include: {
      successor: {
        include: {
          predecessors: {
            include: { predecessor: { select: { id: true, status: true } } },
          },
          project: { select: { id: true, type: true, status: true } },
        },
      },
    },
  });

  for (const dep of ssDeps) {
    const successor = dep.successor;
    if (
      successor.status === TaskStatus.COMPLETED ||
      successor.status === TaskStatus.DROPPED
    ) {
      continue;
    }
    if (successor.project?.status !== ProjectStatus.ACTIVE) continue;

    // Check all SS predecessors have started (not NOT_STARTED or WAITING)
    const ssPreds = successor.predecessors.filter(
      (p) => p.type === DependencyType.START_TO_START
    );
    const allStarted = ssPreds.every(
      (p) =>
        p.predecessor.status !== TaskStatus.NOT_STARTED &&
        p.predecessor.status !== TaskStatus.WAITING
    );
    if (!allStarted) continue;

    // For sequential projects, check no other next action exists
    if (successor.project?.type === "SEQUENTIAL") {
      const existingNext = await prisma.task.findFirst({
        where: {
          projectId: successor.project.id,
          isNextAction: true,
          status: { in: [TaskStatus.NOT_STARTED, TaskStatus.IN_PROGRESS] },
          id: { not: taskId },
        },
      });
      if (existingNext) continue;
    }

    await prisma.task.update({
      where: { id: successor.id },
      data: { isNextAction: true, version: { increment: 1 } },
    });
    result.promotedTasks.push({ id: successor.id, title: successor.title });
  }

  // 2. Ensure this task is properly marked as next action if it should be
  if (task.project && !task.isNextAction && task.status === TaskStatus.IN_PROGRESS) {
    const shouldBeNext = await computeNextAction({
      projectId: task.project.id,
      projectType: task.project.type,
      userId,
    });
    if (shouldBeNext) {
      await prisma.task.update({
        where: { id: taskId },
        data: { isNextAction: true, version: { increment: 1 } },
      });
    }
  }

  return result;
}

/**
 * Complete all non-completed tasks in a project and recursively complete child projects.
 * Called when a user manually completes a project via status changer or StatusCircle.
 */
export async function completeAllProjectTasks(
  projectId: string,
  userId: string,
  result: CascadeResult
): Promise<void> {
  const now = new Date();

  // 1. Find all non-completed/dropped tasks in the project
  const tasks = await prisma.task.findMany({
    where: {
      projectId,
      status: { notIn: [TaskStatus.COMPLETED, TaskStatus.DROPPED] },
    },
    select: { id: true, title: true },
  });

  // 2. Bulk-update them to COMPLETED
  if (tasks.length > 0) {
    await prisma.task.updateMany({
      where: { id: { in: tasks.map((t) => t.id) } },
      data: {
        status: TaskStatus.COMPLETED,
        completedAt: now,
        isNextAction: false,
        version: { increment: 1 },
      },
    });

    // Write task events for each
    for (const task of tasks) {
      await writeTaskEvent(
        prisma,
        task.id,
        "COMPLETED",
        { status: { old: "NOT_STARTED", new: "COMPLETED" } },
        {
          actorType: "SYSTEM",
          actorId: userId,
          source: "CASCADE",
          message: `Completed when project was marked complete`,
        }
      );
    }

    result.completedTasks.push(...tasks);
  }

  // 3. Find all non-completed/dropped child projects
  const children = await prisma.project.findMany({
    where: {
      parentProjectId: projectId,
      status: { notIn: [ProjectStatus.COMPLETED, ProjectStatus.DROPPED] },
    },
    select: { id: true, title: true, parentProjectId: true },
  });

  for (const child of children) {
    // Complete the child project
    await prisma.project.update({
      where: { id: child.id },
      data: { status: ProjectStatus.COMPLETED, completedAt: now, version: { increment: 1 } },
    });
    result.completedProjects.push({ id: child.id, title: child.title });

    // Recursively complete its tasks and children
    await completeAllProjectTasks(child.id, userId, result);
  }

  // 4. Recalculate rollups for the project and promote next child in parent
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { parentProjectId: true, goalId: true },
  });

  if (project?.parentProjectId) {
    const rollupResults = await recalculateProjectRollups(project.parentProjectId);
    result.updatedRollups.push(...rollupResults);

    const activated = await promoteNextChild(
      projectId,
      project.parentProjectId,
      userId,
      { actorType: "SYSTEM", actorId: userId, source: "CASCADE" }
    );
    if (activated) {
      result.activatedProjects.push(activated);
    }
  }
}
