import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound } from "@/lib/api/auth-helpers";
import type {
  FlowApiResponse,
  FlowTask,
  FlowBlockedTask,
  BlockerChainNode,
  TeamMemberBreakdown,
} from "@/lib/flow/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  // 1. Fetch root project with child projects (2 levels deep)
  const project = await prisma.project.findFirst({
    where: { id: params.id, userId },
    select: {
      id: true,
      title: true,
      status: true,
      type: true,
      childType: true,
      teamId: true,
      velocityUnit: true,
      childProjects: {
        select: {
          id: true,
          title: true,
          status: true,
          type: true,
          childType: true,
          childProjects: {
            select: { id: true, title: true, status: true, type: true },
            orderBy: { sortOrder: "asc" },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!project) return notFound("Project not found");

  // 2. Collect all project IDs from tree
  const projectIds: string[] = [project.id];
  const projectTitleMap = new Map<string, string>();
  projectTitleMap.set(project.id, project.title);
  for (const child of project.childProjects) {
    projectIds.push(child.id);
    projectTitleMap.set(child.id, child.title);
    for (const grandchild of child.childProjects) {
      projectIds.push(grandchild.id);
      projectTitleMap.set(grandchild.id, grandchild.title);
    }
  }

  // 3. Fetch all tasks in the project tree
  const tasks = await prisma.task.findMany({
    where: { projectId: { in: projectIds }, userId },
    select: {
      id: true,
      title: true,
      status: true,
      isNextAction: true,
      estimatedMins: true,
      completedAt: true,
      updatedAt: true,
      sortOrder: true,
      projectId: true,
      contextId: true,
      version: true,
      context: { select: { name: true } },
      assignedToId: true,
      assignedTo: { select: { name: true } },
    },
    orderBy: { sortOrder: "asc" },
  });

  const taskIds = tasks.map((t) => t.id);

  // 4. Fetch explicit dependencies
  const explicitDeps =
    taskIds.length > 0
      ? await prisma.taskDependency.findMany({
          where: {
            predecessorId: { in: taskIds },
            successorId: { in: taskIds },
          },
        })
      : [];

  // 5. Generate implicit sequential deps (reuse gantt pattern)
  const allProjects = [
    { id: project.id, type: project.type },
    ...project.childProjects.map((c) => ({ id: c.id, type: c.type })),
    ...project.childProjects.flatMap((c) =>
      c.childProjects.map((gc) => ({ id: gc.id, type: gc.type }))
    ),
  ];
  const sequentialProjectIds = new Set(
    allProjects.filter((p) => p.type === "SEQUENTIAL").map((p) => p.id)
  );

  const explicitPairs = new Set(
    explicitDeps.map((d) => `${d.predecessorId}:${d.successorId}`)
  );

  interface DepRecord {
    id: string;
    predecessorId: string;
    successorId: string;
    type: string;
    lagMinutes: number;
  }

  const implicitDeps: DepRecord[] = [];

  // Task-level chains for sequential projects
  if (sequentialProjectIds.size > 0) {
    const tasksByProject = new Map<string, typeof tasks>();
    for (const t of tasks) {
      if (!t.projectId || !sequentialProjectIds.has(t.projectId)) continue;
      let arr = tasksByProject.get(t.projectId);
      if (!arr) {
        arr = [];
        tasksByProject.set(t.projectId, arr);
      }
      arr.push(t);
    }

    for (const projectTasks of Array.from(tasksByProject.values())) {
      for (let i = 0; i < projectTasks.length - 1; i++) {
        const pred = projectTasks[i];
        const succ = projectTasks[i + 1];
        const pairKey = `${pred.id}:${succ.id}`;
        if (!explicitPairs.has(pairKey)) {
          implicitDeps.push({
            id: `seq-${pred.id}-${succ.id}`,
            predecessorId: pred.id,
            successorId: succ.id,
            type: "FINISH_TO_START",
            lagMinutes: 0,
          });
        }
      }
    }
  }

  // Sub-project chains
  if (
    project.childType === "SEQUENTIAL" &&
    project.childProjects.length > 1
  ) {
    for (let i = 0; i < project.childProjects.length - 1; i++) {
      const predProject = project.childProjects[i];
      const succProject = project.childProjects[i + 1];
      implicitDeps.push({
        id: `subproj-${predProject.id}-${succProject.id}`,
        predecessorId: predProject.id,
        successorId: succProject.id,
        type: "FINISH_TO_START",
        lagMinutes: 0,
      });
    }
  }

  for (const child of project.childProjects) {
    if (child.childType === "SEQUENTIAL" && child.childProjects.length > 1) {
      for (let i = 0; i < child.childProjects.length - 1; i++) {
        const predGc = child.childProjects[i];
        const succGc = child.childProjects[i + 1];
        implicitDeps.push({
          id: `subproj-${predGc.id}-${succGc.id}`,
          predecessorId: predGc.id,
          successorId: succGc.id,
          type: "FINISH_TO_START",
          lagMinutes: 0,
        });
      }
    }
  }

  // Bridge links
  if (
    project.type === "SEQUENTIAL" &&
    project.childProjects.length > 0
  ) {
    const rootTasks = tasks.filter((t) => t.projectId === project.id);
    if (rootTasks.length > 0) {
      const lastRootTask = rootTasks[rootTasks.length - 1];
      const firstChildProject = project.childProjects[0];
      implicitDeps.push({
        id: `bridge-${lastRootTask.id}-${firstChildProject.id}`,
        predecessorId: lastRootTask.id,
        successorId: firstChildProject.id,
        type: "FINISH_TO_START",
        lagMinutes: 0,
      });
    }
  }

  const allDeps = [...explicitDeps, ...implicitDeps];

  // 6. Resolve sub-project deps to task-level deps
  // For deps where predecessor/successor is a project ID, resolve to tasks
  const projectIdSet = new Set(projectIds);
  const resolvedDeps: { predecessorId: string; successorId: string }[] = [];

  for (const dep of allDeps) {
    const predIsProject = projectIdSet.has(dep.predecessorId);
    const succIsProject = projectIdSet.has(dep.successorId);

    if (!predIsProject && !succIsProject) {
      // Both are tasks — keep as-is
      resolvedDeps.push({
        predecessorId: dep.predecessorId,
        successorId: dep.successorId,
      });
    } else if (predIsProject && succIsProject) {
      // Project-to-project: last task of pred project → first task of succ project
      const predTasks = tasks.filter((t) => t.projectId === dep.predecessorId);
      const succTasks = tasks.filter((t) => t.projectId === dep.successorId);
      if (predTasks.length > 0 && succTasks.length > 0) {
        // All tasks in pred project block all tasks in succ project
        for (const succTask of succTasks) {
          for (const predTask of predTasks) {
            resolvedDeps.push({
              predecessorId: predTask.id,
              successorId: succTask.id,
            });
          }
        }
      }
    } else if (predIsProject) {
      // Project → task
      const predTasks = tasks.filter((t) => t.projectId === dep.predecessorId);
      for (const predTask of predTasks) {
        resolvedDeps.push({
          predecessorId: predTask.id,
          successorId: dep.successorId,
        });
      }
    } else {
      // Task → project
      const succTasks = tasks.filter((t) => t.projectId === dep.successorId);
      for (const succTask of succTasks) {
        resolvedDeps.push({
          predecessorId: dep.predecessorId,
          successorId: succTask.id,
        });
      }
    }
  }

  // 7. Build predecessor map (successorId → predecessorIds[])
  const predecessorMap = new Map<string, Set<string>>();
  for (const dep of resolvedDeps) {
    let set = predecessorMap.get(dep.successorId);
    if (!set) {
      set = new Set();
      predecessorMap.set(dep.successorId, set);
    }
    set.add(dep.predecessorId);
  }

  // Build successor map for team breakdown (predecessorId → successorIds[])
  const successorMap = new Map<string, Set<string>>();
  for (const dep of resolvedDeps) {
    let set = successorMap.get(dep.predecessorId);
    if (!set) {
      set = new Set();
      successorMap.set(dep.predecessorId, set);
    }
    set.add(dep.successorId);
  }

  // 8. Classify tasks into zones
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const now = Date.now();
  const dayMs = 86400000;

  function isComplete(status: string) {
    return status === "COMPLETED" || status === "DROPPED";
  }

  function toFlowTask(t: (typeof tasks)[0]): FlowTask {
    return {
      id: t.id,
      title: t.title,
      status: t.status,
      isNextAction: t.isNextAction,
      estimatedMins: t.estimatedMins,
      contextId: t.contextId,
      contextName: t.context?.name ?? null,
      assignedToId: t.assignedToId,
      assignedToName: t.assignedTo?.name ?? null,
      projectId: t.projectId!,
      projectTitle: projectTitleMap.get(t.projectId!) ?? "",
      completedAt: t.completedAt?.toISOString() ?? null,
      updatedAt: t.updatedAt.toISOString(),
      version: t.version,
    };
  }

  const actionable: FlowTask[] = [];
  const blocked: FlowBlockedTask[] = [];
  const completed: FlowTask[] = [];

  for (const t of tasks) {
    if (isComplete(t.status)) {
      completed.push(toFlowTask(t));
      continue;
    }

    const preds = predecessorMap.get(t.id);
    if (!preds || preds.size === 0) {
      actionable.push(toFlowTask(t));
      continue;
    }

    // Check if all predecessors are complete
    let allPredsComplete = true;
    for (const predId of Array.from(preds)) {
      const pred = taskMap.get(predId);
      if (pred && !isComplete(pred.status)) {
        allPredsComplete = false;
        break;
      }
    }

    if (allPredsComplete) {
      actionable.push(toFlowTask(t));
    } else {
      // Build blocker chain
      const chain = buildBlockerChain(t.id, new Set(), 0);
      const depth = computeChainDepth(chain);
      const stalest = computeStalestDays(chain);

      blocked.push({
        ...toFlowTask(t),
        blockerChain: chain,
        totalChainDepth: depth,
        stalestBlockerDays: stalest,
      });
    }
  }

  // Sort blocked by stalestBlockerDays descending (worst first)
  blocked.sort((a, b) => b.stalestBlockerDays - a.stalestBlockerDays);

  // 9. Build blocker chain helpers
  function buildBlockerChain(
    taskId: string,
    visited: Set<string>,
    depth: number
  ): BlockerChainNode[] {
    if (depth >= 5) return [];
    const preds = predecessorMap.get(taskId);
    if (!preds) return [];

    const nodes: BlockerChainNode[] = [];
    for (const predId of Array.from(preds)) {
      if (visited.has(predId)) continue; // cycle detection
      const pred = taskMap.get(predId);
      if (!pred || isComplete(pred.status)) continue;

      visited.add(predId);
      const staleDays = Math.floor(
        (now - pred.updatedAt.getTime()) / dayMs
      );

      nodes.push({
        id: pred.id,
        title: pred.title,
        status: pred.status,
        assignedToId: pred.assignedToId,
        assignedToName: pred.assignedTo?.name ?? null,
        projectId: pred.projectId,
        staleDays,
        blockedBy: buildBlockerChain(predId, visited, depth + 1),
      });
    }
    return nodes;
  }

  function computeChainDepth(chain: BlockerChainNode[]): number {
    if (chain.length === 0) return 0;
    let max = 0;
    for (const node of chain) {
      const d = 1 + computeChainDepth(node.blockedBy);
      if (d > max) max = d;
    }
    return max;
  }

  function computeStalestDays(chain: BlockerChainNode[]): number {
    let max = 0;
    for (const node of chain) {
      if (node.staleDays > max) max = node.staleDays;
      const childMax = computeStalestDays(node.blockedBy);
      if (childMax > max) max = childMax;
    }
    return max;
  }

  // 10. Compute summary
  const activeTasks = tasks.filter((t) => t.status !== "DROPPED");
  const totalEstimatedMins = activeTasks.reduce(
    (sum, t) => sum + (t.estimatedMins || 0),
    0
  );

  // Simplified task-count velocity for projection (last 4 weeks)
  const fourWeeksAgo = new Date(now);
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
  const completedInLast4Weeks = tasks.filter(
    (t) =>
      t.status === "COMPLETED" &&
      t.completedAt &&
      t.completedAt >= fourWeeksAgo
  ).length;
  const velocityTasksPerWeek =
    Math.round((completedInLast4Weeks / 4) * 10) / 10;
  const completedEstimatedMins = activeTasks
    .filter((t) => t.status === "COMPLETED")
    .reduce((sum, t) => sum + (t.estimatedMins || 0), 0);
  const remainingEstimatedMins = totalEstimatedMins - completedEstimatedMins;

  let longestBlockingChainDepth = 0;
  for (const b of blocked) {
    if (b.totalChainDepth > longestBlockingChainDepth) {
      longestBlockingChainDepth = b.totalChainDepth;
    }
  }

  // Projected completion (task-count based)
  const remainingTasks = tasks.filter(
    (t) => t.status !== "COMPLETED" && t.status !== "DROPPED"
  ).length;
  let projectedCompletionDate: string | null = null;
  let projectedDaysRemaining: number | null = null;
  if (velocityTasksPerWeek > 0 && remainingTasks > 0) {
    const weeksRemaining = remainingTasks / velocityTasksPerWeek;
    projectedDaysRemaining = Math.ceil(weeksRemaining * 7);
    const completionDate = new Date(now);
    completionDate.setDate(completionDate.getDate() + projectedDaysRemaining);
    projectedCompletionDate = completionDate.toISOString().slice(0, 10);
  }

  // 11. Team breakdown
  let teamBreakdown: TeamMemberBreakdown[] | null = null;
  if (project.teamId) {
    const memberMap = new Map<
      string,
      {
        name: string;
        actionableCount: number;
        actionableMins: number;
        blockedCount: number;
        blockingOthersCount: number;
      }
    >();

    // Collect members from actionable tasks
    for (const t of actionable) {
      if (!t.assignedToId) continue;
      if (!memberMap.has(t.assignedToId)) {
        memberMap.set(t.assignedToId, {
          name: t.assignedToName || "Unknown",
          actionableCount: 0,
          actionableMins: 0,
          blockedCount: 0,
          blockingOthersCount: 0,
        });
      }
      const m = memberMap.get(t.assignedToId)!;
      m.actionableCount++;
      m.actionableMins += t.estimatedMins || 0;
    }

    // Collect from blocked tasks
    for (const t of blocked) {
      if (!t.assignedToId) continue;
      if (!memberMap.has(t.assignedToId)) {
        memberMap.set(t.assignedToId, {
          name: t.assignedToName || "Unknown",
          actionableCount: 0,
          actionableMins: 0,
          blockedCount: 0,
          blockingOthersCount: 0,
        });
      }
      memberMap.get(t.assignedToId)!.blockedCount++;
    }

    // Compute "blocking others" — tasks that are predecessors of someone else's blocked task
    const blockedTaskIds = new Set(blocked.map((b) => b.id));
    for (const t of tasks) {
      if (isComplete(t.status)) continue;
      if (!t.assignedToId) continue;

      const succs = successorMap.get(t.id);
      if (!succs) continue;

      let isBlockingOthers = false;
      for (const succId of Array.from(succs)) {
        if (blockedTaskIds.has(succId)) {
          const succTask = taskMap.get(succId);
          if (succTask && succTask.assignedToId !== t.assignedToId) {
            isBlockingOthers = true;
            break;
          }
        }
      }

      if (isBlockingOthers) {
        if (!memberMap.has(t.assignedToId)) {
          memberMap.set(t.assignedToId, {
            name: t.assignedTo?.name || "Unknown",
            actionableCount: 0,
            actionableMins: 0,
            blockedCount: 0,
            blockingOthersCount: 0,
          });
        }
        memberMap.get(t.assignedToId)!.blockingOthersCount++;
      }
    }

    teamBreakdown = Array.from(memberMap.entries()).map(([uid, data]) => ({
      userId: uid,
      userName: data.name,
      actionableCount: data.actionableCount,
      actionableMins: data.actionableMins,
      blockedCount: data.blockedCount,
      blockingOthersCount: data.blockingOthersCount,
    }));
  }

  // 12. Build response
  const response: FlowApiResponse = {
    project: {
      id: project.id,
      title: project.title,
      status: project.status,
      type: project.type,
      teamId: project.teamId,
      velocityUnit: project.velocityUnit,
    },
    summary: {
      totalEstimatedMins,
      completedEstimatedMins,
      remainingEstimatedMins,
      totalTasks: tasks.length,
      completedTasks: completed.length,
      blockedTasks: blocked.length,
      actionableTasks: actionable.length,
      longestBlockingChainDepth,
      projectedCompletionDate,
      projectedDaysRemaining,
      velocityTasksPerWeek,
    },
    zones: {
      actionable,
      blocked,
      completed,
    },
    teamBreakdown,
  };

  return NextResponse.json(response);
}
