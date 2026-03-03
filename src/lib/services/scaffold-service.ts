import { prisma } from "@/lib/prisma";
import { createProject } from "./project-service";
import { createTask } from "./task-service";
import type { ActorContext } from "./task-service";
import type { ProjectScaffoldSuggestion } from "@/lib/ai/scaffold-types";
import type { Project } from "@prisma/client";

interface ApplyScaffoldOptions {
  userId: string;
  projectTitle: string;
  projectDescription?: string;
  suggestion: ProjectScaffoldSuggestion;
  areaId?: string;
  goalId?: string;
  teamId?: string;
  parentProjectId?: string;
  actor: ActorContext;
}

export async function applyProjectScaffold(
  options: ApplyScaffoldOptions
): Promise<Project> {
  const {
    userId,
    projectTitle,
    projectDescription,
    suggestion,
    areaId,
    goalId,
    teamId,
    parentProjectId,
    actor,
  } = options;

  // Resolve context names to IDs
  const userContexts = await prisma.context.findMany({
    where: { userId },
    select: { id: true, name: true },
  });
  const contextMap = new Map(userContexts.map((c) => [c.name, c.id]));

  // 1. Create the project
  const project = await createProject(
    userId,
    {
      title: projectTitle,
      description: projectDescription,
      type: suggestion.projectType,
      childType: "SEQUENTIAL",
      isSomedayMaybe: false,
      areaId,
      goalId,
      teamId: teamId ?? null,
    },
    actor
  );

  // If parentProjectId was provided, update the project hierarchy
  if (parentProjectId) {
    const parent = await prisma.project.findFirst({
      where: { id: parentProjectId },
      select: { id: true, depth: true, path: true },
    });
    if (parent && parent.depth < 2) {
      await prisma.project.update({
        where: { id: project.id },
        data: {
          parentProjectId: parent.id,
          depth: parent.depth + 1,
          path: parent.path + parent.id + "/",
          version: { increment: 1 },
        },
      });
    }
  }

  // 2. Create tasks in sort order
  const taskIdBySortOrder = new Map<number, string>();
  const sortedTasks = [...suggestion.tasks].sort(
    (a, b) => a.sortOrder - b.sortOrder
  );

  for (const taskSuggestion of sortedTasks) {
    const task = await createTask(
      userId,
      {
        title: taskSuggestion.title,
        projectId: project.id,
        estimatedMins: taskSuggestion.estimatedMins || undefined,
        energyLevel: taskSuggestion.energyLevel || undefined,
        contextId: taskSuggestion.contextName
          ? contextMap.get(taskSuggestion.contextName)
          : undefined,
        sortOrder: taskSuggestion.sortOrder,
      },
      actor
    );

    taskIdBySortOrder.set(taskSuggestion.sortOrder, task.id);
  }

  // 3. Create dependencies
  for (const taskSuggestion of suggestion.tasks) {
    if (!taskSuggestion.dependsOn?.length) continue;

    const successorId = taskIdBySortOrder.get(taskSuggestion.sortOrder);
    if (!successorId) continue;

    for (const predIndex of taskSuggestion.dependsOn) {
      const predecessorId = taskIdBySortOrder.get(predIndex);
      if (!predecessorId) continue;

      await prisma.taskDependency.create({
        data: {
          predecessorId,
          successorId,
          type: "FINISH_TO_START",
          lagMinutes: 0,
        },
      });
    }
  }

  return project;
}
