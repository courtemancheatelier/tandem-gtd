import { prisma } from "@/lib/prisma";
import { createProject } from "./project-service";
import { createTask } from "./task-service";
import type { ActorContext } from "./task-service";
import type { CreateProjectInput } from "@/lib/validations/project";

interface InstantiateOptions {
  templateId: string;
  userId: string;
  variables: Record<string, string>;
  projectTitle?: string;
  targetDate?: string;
  areaId?: string;
  goalId?: string;
  teamId?: string;
  actor: ActorContext;
}

export async function instantiateTemplate(options: InstantiateOptions) {
  const {
    templateId,
    userId,
    variables,
    projectTitle,
    targetDate,
    areaId,
    goalId,
    teamId,
    actor,
  } = options;

  const template = await prisma.projectTemplate.findUnique({
    where: { id: templateId },
    include: {
      taskTemplates: {
        where: { subProjectTemplateId: null },
        orderBy: { sortOrder: "asc" },
      },
      subProjectTemplates: {
        orderBy: { sortOrder: "asc" },
        include: {
          tasks: { orderBy: { sortOrder: "asc" } },
        },
      },
    },
  });

  if (!template) throw new Error("Template not found");

  // Access check: system templates are available to all, user templates only to owner
  if (!template.isSystem && template.userId !== userId) {
    throw new Error("Template not found");
  }

  // Resolve variable placeholders
  const resolve = (text: string): string => {
    let resolved = text;
    for (const [key, value] of Object.entries(variables)) {
      resolved = resolved.replaceAll(`{${key}}`, value);
    }
    return resolved;
  };

  // Resolve context names to IDs for this user
  const userContexts = await prisma.context.findMany({
    where: { userId },
    select: { id: true, name: true },
  });
  const contextMap = new Map(userContexts.map((c) => [c.name, c.id]));

  // 1. Create the main project
  const project = await createProject(
    userId,
    {
      title: resolve(projectTitle || template.title),
      description: template.description || undefined,
      type: template.type as CreateProjectInput["type"],
      childType: "SEQUENTIAL",
      outcome: template.outcome ? resolve(template.outcome) : undefined,
      targetDate: targetDate || undefined,
      areaId: areaId || undefined,
      goalId: goalId || undefined,
      teamId: teamId || undefined,
      isSomedayMaybe: false,
    },
    actor
  );

  // 2. Create sub-projects (if any)
  for (const subTemplate of template.subProjectTemplates) {
    const subProject = await createProject(
      userId,
      {
        title: resolve(subTemplate.title),
        type: subTemplate.type as CreateProjectInput["type"],
        childType: "SEQUENTIAL",
        outcome: subTemplate.outcome
          ? resolve(subTemplate.outcome)
          : undefined,
        teamId: teamId || undefined,
        isSomedayMaybe: false,
      },
      actor
    );

    // Set as child of main project
    await prisma.project.update({
      where: { id: subProject.id },
      data: {
        parentProjectId: project.id,
        depth: 1,
        path: `${project.id}/`,
      },
    });

    // Create tasks for this sub-project
    for (const taskTemplate of subTemplate.tasks) {
      await createTask(
        userId,
        {
          title: resolve(taskTemplate.title),
          notes: taskTemplate.notes
            ? resolve(taskTemplate.notes)
            : undefined,
          estimatedMins: taskTemplate.estimatedMins || undefined,
          energyLevel: taskTemplate.energyLevel || undefined,
          projectId: subProject.id,
          contextId: taskTemplate.contextName
            ? contextMap.get(taskTemplate.contextName)
            : undefined,
          sortOrder: taskTemplate.sortOrder,
        },
        actor
      );
    }
  }

  // 3. Create top-level tasks
  for (const taskTemplate of template.taskTemplates) {
    await createTask(
      userId,
      {
        title: resolve(taskTemplate.title),
        notes: taskTemplate.notes
          ? resolve(taskTemplate.notes)
          : undefined,
        estimatedMins: taskTemplate.estimatedMins || undefined,
        energyLevel: taskTemplate.energyLevel || undefined,
        projectId: project.id,
        contextId: taskTemplate.contextName
          ? contextMap.get(taskTemplate.contextName)
          : undefined,
        sortOrder: taskTemplate.sortOrder,
      },
      actor
    );
  }

  return project;
}

export async function saveProjectAsTemplate(
  projectId: string,
  userId: string,
  options: { title?: string; description?: string } = {}
) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    include: {
      tasks: {
        where: { status: { not: "DROPPED" } },
        orderBy: { sortOrder: "asc" },
        include: {
          context: { select: { name: true } },
        },
      },
      childProjects: {
        orderBy: { sortOrder: "asc" },
        include: {
          tasks: {
            where: { status: { not: "DROPPED" } },
            orderBy: { sortOrder: "asc" },
            include: {
              context: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  if (!project) throw new Error("Project not found");

  // Create template (without nested children to avoid FK issues)
  const template = await prisma.projectTemplate.create({
    data: {
      title: options.title || `${project.title} Template`,
      description: options.description || project.description,
      type: project.type,
      outcome: project.outcome,
      userId,
      isSystem: false,
      variables: [],
    },
  });

  // Create sub-project templates and their tasks
  for (let i = 0; i < project.childProjects.length; i++) {
    const child = project.childProjects[i];
    const subTemplate = await prisma.projectSubTemplate.create({
      data: {
        title: child.title,
        type: child.type,
        outcome: child.outcome,
        sortOrder: i,
        templateId: template.id,
      },
    });

    for (let j = 0; j < child.tasks.length; j++) {
      const task = child.tasks[j];
      await prisma.projectTaskTemplate.create({
        data: {
          title: task.title,
          notes: task.notes,
          estimatedMins: task.estimatedMins,
          energyLevel: task.energyLevel,
          contextName: task.context?.name || null,
          sortOrder: j,
          templateId: template.id,
          subProjectTemplateId: subTemplate.id,
        },
      });
    }
  }

  // Create top-level task templates
  for (let i = 0; i < project.tasks.length; i++) {
    const task = project.tasks[i];
    await prisma.projectTaskTemplate.create({
      data: {
        title: task.title,
        notes: task.notes,
        estimatedMins: task.estimatedMins,
        energyLevel: task.energyLevel,
        contextName: task.context?.name || null,
        sortOrder: i,
        templateId: template.id,
      },
    });
  }

  // Re-fetch with all relations
  return prisma.projectTemplate.findUnique({
    where: { id: template.id },
    include: {
      taskTemplates: { orderBy: { sortOrder: "asc" } },
      subProjectTemplates: {
        orderBy: { sortOrder: "asc" },
        include: { tasks: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });
}
