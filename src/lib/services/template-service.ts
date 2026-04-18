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
  /** If true, skip post-instantiation hooks (team, RSVP, wiki, threads) */
  skipHooks?: boolean;
}

// ── Template meta types (read from YAML `meta` block) ───────────────────────

interface TemplateMeta {
  teamRoles?: string[];
  rsvpFields?: {
    label: string;
    type: string;
    isRequired?: boolean;
    isOrgOnly?: boolean;
    sortOrder?: number;
    options?: string[];
  }[];
  rsvpLockWeeksBefore?: number;
  suggestedThreads?: {
    title: string;
    purpose: string;
  }[];
  wikiPages?: {
    title: string;
    slug: string;
    content: string;
  }[];
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

  // Access check: system templates are available to all, user templates only to owner,
  // team templates to team members
  if (!template.isSystem && template.userId !== userId) {
    if (template.teamId) {
      const membership = await prisma.teamMember.findFirst({
        where: { teamId: template.teamId, userId },
      });
      if (!membership) throw new Error("Template not found");
    } else {
      throw new Error("Template not found");
    }
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

  // 4. Run post-instantiation hooks (team, RSVP, wiki, threads) for system templates with meta
  if (!options.skipHooks && template.isSystem && template.sourceFile) {
    try {
      await runPostInstantiationHooks({
        sourceFile: template.sourceFile,
        projectId: project.id,
        userId,
        variables,
        targetDate,
        teamId: teamId || undefined,
        resolve,
        actor,
      });
    } catch (err) {
      // Non-fatal — the project and tasks are already created
      console.error("[template] Post-instantiation hook error:", err);
    }
  }

  return project;
}

// ── Post-instantiation hooks ────────────────────────────────────────────────

interface PostInstantiationContext {
  sourceFile: string;
  projectId: string;
  userId: string;
  variables: Record<string, string>;
  targetDate?: string;
  teamId?: string;
  resolve: (text: string) => string;
  actor: ActorContext;
}

async function loadTemplateMeta(
  sourceFile: string
): Promise<TemplateMeta | null> {
  try {
    const { readFile } = await import("fs/promises");
    const { join } = await import("path");
    const yaml = (await import("js-yaml")).default;
    const filePath = join(process.cwd(), "docs/templates", sourceFile);
    const raw = await readFile(filePath, "utf-8");
    const data = yaml.load(raw) as { meta?: TemplateMeta };
    return data.meta || null;
  } catch {
    return null;
  }
}

async function runPostInstantiationHooks(ctx: PostInstantiationContext) {
  const meta = await loadTemplateMeta(ctx.sourceFile);
  if (!meta) return;

  let effectiveTeamId = ctx.teamId;

  // 1. Create team with roles (if template defines teamRoles and no team was provided)
  if (meta.teamRoles && meta.teamRoles.length > 0 && !effectiveTeamId) {
    const project = await prisma.project.findUnique({
      where: { id: ctx.projectId },
      select: { title: true },
    });

    const team = await prisma.team.create({
      data: {
        name: project?.title || "Wedding Team",
        description: `Team for ${project?.title || "wedding planning"}`,
        icon: "💍",
        createdById: ctx.userId,
      },
    });

    // Add creator as admin
    await prisma.teamMember.create({
      data: {
        teamId: team.id,
        userId: ctx.userId,
        role: "ADMIN",
        label: meta.teamRoles[0] || "Couple", // First role is the creator's label
      },
    });

    // Link project to team
    await prisma.project.update({
      where: { id: ctx.projectId },
      data: { teamId: team.id },
    });

    // Also link sub-projects to team
    await prisma.project.updateMany({
      where: { parentProjectId: ctx.projectId },
      data: { teamId: team.id },
    });

    effectiveTeamId = team.id;
  }

  // 2. Create Event with RSVP fields
  if (meta.rsvpFields && meta.rsvpFields.length > 0 && ctx.targetDate) {
    const eventDate = new Date(ctx.targetDate);
    let lockDate: Date | undefined;
    if (meta.rsvpLockWeeksBefore) {
      lockDate = new Date(eventDate);
      lockDate.setDate(lockDate.getDate() - meta.rsvpLockWeeksBefore * 7);
    }

    const project = await prisma.project.findUnique({
      where: { id: ctx.projectId },
      select: { title: true },
    });

    const event = await prisma.event.create({
      data: {
        title: project?.title || "Wedding",
        eventDate,
        lockDate: lockDate || undefined,
        projectId: ctx.projectId,
        teamId: effectiveTeamId || undefined,
        ownerId: ctx.userId,
      },
    });

    // Add RSVP fields
    for (const field of meta.rsvpFields) {
      await prisma.eventField.create({
        data: {
          eventId: event.id,
          type: field.type as "HEADCOUNT" | "SINGLE_SELECT" | "TEXT" | "TOGGLE" | "MULTI_SELECT" | "CLAIM" | "ATTENDANCE",
          label: field.label,
          isRequired: field.isRequired ?? false,
          isOrgOnly: field.isOrgOnly ?? false,
          sortOrder: field.sortOrder ?? 0,
          options: field.options ? field.options : undefined,
        },
      });
    }

    // Create RSVP lock cascade trigger tasks (§5.3)
    const triggerTasks = [
      { condition: "RSVP_LOCKED", taskTitle: "Follow up with non-responders" },
      {
        condition: "RSVP_LOCKED",
        taskTitle: "Compile final headcount from RSVP responses",
      },
      {
        condition: "RSVP_LOCKED",
        taskTitle: "Compile dietary restrictions from RSVP responses",
      },
    ];

    for (const trigger of triggerTasks) {
      await prisma.eventTrigger.create({
        data: {
          eventId: event.id,
          condition: trigger.condition,
          taskTitle: trigger.taskTitle,
        },
      });
    }

    // Auto-add organizer invitation
    const owner = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { email: true },
    });
    if (owner) {
      await prisma.eventInvitation.create({
        data: {
          eventId: event.id,
          email: owner.email.toLowerCase(),
          role: "Organizer",
          status: "ACCEPTED",
          acceptedAt: new Date(),
          userId: ctx.userId,
        },
      });
    }
  }

  // 3. Create wiki pages
  if (meta.wikiPages && meta.wikiPages.length > 0) {
    for (const page of meta.wikiPages) {
      const resolvedContent = ctx.resolve(page.content);
      const resolvedTitle = ctx.resolve(page.title);

      // Check if slug already exists for this user
      const existing = await prisma.wikiArticle.findUnique({
        where: { userId_slug: { userId: ctx.userId, slug: page.slug } },
      });

      if (!existing) {
        await prisma.wikiArticle.create({
          data: {
            title: resolvedTitle,
            slug: page.slug,
            content: resolvedContent,
            tags: ["wedding", "reference"],
            userId: ctx.userId,
            teamId: effectiveTeamId || undefined,
          },
        });
      }
    }
  }

  // 4. Create suggested discussion threads
  if (meta.suggestedThreads && meta.suggestedThreads.length > 0) {
    for (const thread of meta.suggestedThreads) {
      await prisma.thread.create({
        data: {
          title: ctx.resolve(thread.title),
          purpose: thread.purpose as "QUESTION" | "BLOCKER" | "UPDATE" | "FYI",
          projectId: ctx.projectId,
          createdById: ctx.userId,
        },
      });
    }
  }
}

export async function saveProjectAsTemplate(
  projectId: string,
  userId: string,
  options: { title?: string; description?: string; teamId?: string } = {}
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

  // Validate team membership if teamId provided
  if (options.teamId) {
    const membership = await prisma.teamMember.findFirst({
      where: { teamId: options.teamId, userId },
    });
    if (!membership) throw new Error("You are not a member of this team");
  }

  // Create template (without nested children to avoid FK issues)
  const template = await prisma.projectTemplate.create({
    data: {
      title: options.title || `${project.title} Template`,
      description: options.description || project.description,
      type: project.type,
      outcome: project.outcome,
      userId: options.teamId ? null : userId,
      teamId: options.teamId || null,
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
