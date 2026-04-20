import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { createTask, type ActorContext } from "@/lib/services/task-service";
import { createProject } from "@/lib/services/project-service";
import { createInboxItem } from "@/lib/services/inbox-service";
import type { ImportPreview, ImportError } from "./types";

// Lookup helpers — find existing entities by name, or ones created earlier in this import

async function findContextByName(
  userId: string,
  name: string
): Promise<string | undefined> {
  const ctx = await prisma.context.findFirst({
    where: { userId, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  return ctx?.id;
}

async function findAreaByName(
  userId: string,
  name: string
): Promise<string | undefined> {
  const area = await prisma.area.findFirst({
    where: { userId, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  return area?.id;
}

async function findGoalByTitle(
  userId: string,
  title: string
): Promise<string | undefined> {
  const goal = await prisma.goal.findFirst({
    where: { userId, title: { equals: title, mode: "insensitive" } },
    select: { id: true },
  });
  return goal?.id;
}

async function findProjectByTitle(
  userId: string,
  title: string
): Promise<string | undefined> {
  const project = await prisma.project.findFirst({
    where: {
      userId,
      teamId: null,
      title: { equals: title, mode: "insensitive" },
    },
    select: { id: true },
  });
  return project?.id;
}

// ---------------------------------------------------------------------------
// Main processor
// ---------------------------------------------------------------------------

export async function processImport(jobId: string): Promise<void> {
  const job = await prisma.importJob.findUniqueOrThrow({
    where: { id: jobId },
  });

  const preview = job.preview as unknown as ImportPreview;
  const userId = job.userId;
  const errors: ImportError[] = [];
  let createdItems = 0;
  let skippedItems = 0;
  let processedItems = 0;

  const actor: ActorContext = {
    actorType: "SYSTEM",
    actorId: userId,
    source: "IMPORT",
  };

  // Track name→id maps for entities created during this import
  const contextMap = new Map<string, string>();
  const areaMap = new Map<string, string>();
  const goalMap = new Map<string, string>();
  const projectMap = new Map<string, string>();

  try {
    // ── 1. Contexts ────────────────────────────────────────────────────────
    for (let i = 0; i < preview.contexts.length; i++) {
      const ctx = preview.contexts[i];
      try {
        if (ctx.isDuplicate) {
          skippedItems++;
          const existingId = await findContextByName(userId, ctx.name);
          if (existingId) contextMap.set(ctx.name.toLowerCase(), existingId);
        } else {
          const created = await prisma.context.create({
            data: {
              name: ctx.name,
              color: ctx.color ?? undefined,
              icon: ctx.icon ?? undefined,
              userId,
            },
          });
          contextMap.set(ctx.name.toLowerCase(), created.id);
          createdItems++;
        }
      } catch (err) {
        errors.push({
          entity: "context",
          index: i,
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
      processedItems++;
    }

    // ── 2. Areas ───────────────────────────────────────────────────────────
    for (let i = 0; i < preview.areas.length; i++) {
      const area = preview.areas[i];
      try {
        if (area.isDuplicate) {
          skippedItems++;
          const existingId = await findAreaByName(userId, area.name);
          if (existingId) areaMap.set(area.name.toLowerCase(), existingId);
        } else {
          const created = await prisma.area.create({
            data: {
              name: area.name,
              description: area.description ?? undefined,
              isActive: area.isActive ?? true,
              userId,
            },
          });
          areaMap.set(area.name.toLowerCase(), created.id);
          createdItems++;
        }
      } catch (err) {
        errors.push({
          entity: "area",
          index: i,
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
      processedItems++;
    }

    // ── 3. Goals ───────────────────────────────────────────────────────────
    for (let i = 0; i < preview.goals.length; i++) {
      const goal = preview.goals[i];
      try {
        if (goal.isDuplicate) {
          skippedItems++;
          const existingId = await findGoalByTitle(userId, goal.title);
          if (existingId) goalMap.set(goal.title.toLowerCase(), existingId);
        } else {
          const areaId = goal.areaName
            ? areaMap.get(goal.areaName.toLowerCase()) ??
              (await findAreaByName(userId, goal.areaName))
            : undefined;

          const created = await prisma.goal.create({
            data: {
              title: goal.title,
              description: goal.description ?? undefined,
              status: (goal.status as "NOT_STARTED" | "IN_PROGRESS" | "ACHIEVED" | "DEFERRED") || "NOT_STARTED",
              horizon: (goal.horizon as "RUNWAY" | "HORIZON_1" | "HORIZON_2" | "HORIZON_3" | "HORIZON_4" | "HORIZON_5") || "HORIZON_3",
              targetDate: goal.targetDate ? new Date(goal.targetDate) : undefined,
              progress: goal.progress ?? 0,
              areaId: areaId ?? undefined,
              userId,
            },
          });
          goalMap.set(goal.title.toLowerCase(), created.id);
          createdItems++;
        }
      } catch (err) {
        errors.push({
          entity: "goal",
          index: i,
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
      processedItems++;
    }

    // ── 4. Projects (parents first, then children) ─────────────────────────
    // Sort so that projects without a parentProjectTitle come first
    const sortedProjects = [...preview.projects].sort((a, b) => {
      const aHasParent = a.parentProjectTitle ? 1 : 0;
      const bHasParent = b.parentProjectTitle ? 1 : 0;
      return aHasParent - bHasParent;
    });

    for (let i = 0; i < sortedProjects.length; i++) {
      const proj = sortedProjects[i];
      try {
        if (proj.isDuplicate && proj.duplicateAction === "skip") {
          skippedItems++;
          const existingId = await findProjectByTitle(userId, proj.title);
          if (existingId) projectMap.set(proj.title.toLowerCase(), existingId);
        } else {
          const areaId = proj.areaName
            ? areaMap.get(proj.areaName.toLowerCase()) ??
              (await findAreaByName(userId, proj.areaName))
            : undefined;

          const goalId = proj.goalTitle
            ? goalMap.get(proj.goalTitle.toLowerCase()) ??
              (await findGoalByTitle(userId, proj.goalTitle))
            : undefined;

          const created = await createProject(
            userId,
            {
              title: proj.title,
              description: proj.description ?? undefined,
              type:
                (proj.type as "SEQUENTIAL" | "PARALLEL" | "SINGLE_ACTIONS") ||
                "SEQUENTIAL",
              childType:
                (proj.childType as "SEQUENTIAL" | "PARALLEL") || "SEQUENTIAL",
              outcome: proj.outcome ?? undefined,
              areaId: areaId ?? undefined,
              goalId: goalId ?? undefined,
              isSomedayMaybe: proj.isSomedayMaybe ?? false,
            },
            actor
          );
          projectMap.set(proj.title.toLowerCase(), created.id);
          createdItems++;
        }
      } catch (err) {
        errors.push({
          entity: "project",
          index: i,
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
      processedItems++;
    }

    // Wire up parent-child relationships for sub-projects
    for (const proj of sortedProjects) {
      if (!proj.parentProjectTitle) continue;
      const childId = projectMap.get(proj.title.toLowerCase());
      const parentId = projectMap.get(proj.parentProjectTitle.toLowerCase());
      if (childId && parentId) {
        await prisma.project.update({
          where: { id: childId },
          data: { parentProjectId: parentId, depth: 1 },
        });
      }
    }

    // ── 5. Tasks ───────────────────────────────────────────────────────────
    for (let i = 0; i < preview.tasks.length; i++) {
      const task = preview.tasks[i];
      try {
        if (task.isDuplicate && task.duplicateAction === "skip") {
          skippedItems++;
        } else {
          const projectId = task.projectTitle
            ? projectMap.get(task.projectTitle.toLowerCase()) ??
              (await findProjectByTitle(userId, task.projectTitle))
            : undefined;

          // Resolve or create context
          let contextId: string | undefined;
          if (task.contextName) {
            contextId =
              contextMap.get(task.contextName.toLowerCase()) ??
              (await findContextByName(userId, task.contextName));
            // Auto-create missing contexts
            if (!contextId) {
              const created = await prisma.context.create({
                data: { name: task.contextName, userId },
              });
              contextMap.set(task.contextName.toLowerCase(), created.id);
              contextId = created.id;
            }
          }

          await createTask(
            userId,
            {
              title: task.title,
              notes: task.notes ?? undefined,
              projectId,
              contextId,
              estimatedMins: task.estimatedMins ?? undefined,
              energyLevel:
                (task.energyLevel as "LOW" | "MEDIUM" | "HIGH") ?? undefined,
              scheduledDate: task.scheduledDate ?? undefined,
              dueDate: task.dueDate ?? undefined,
            },
            actor
          );
          createdItems++;
        }
      } catch (err) {
        errors.push({
          entity: "task",
          index: i,
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
      processedItems++;
    }

    // ── 6. Inbox items ─────────────────────────────────────────────────────
    for (let i = 0; i < preview.inboxItems.length; i++) {
      const item = preview.inboxItems[i];
      try {
        await createInboxItem(
          userId,
          { content: item.content, notes: item.notes ?? undefined },
          actor
        );
        createdItems++;
      } catch (err) {
        errors.push({
          entity: "inboxItem",
          index: i,
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
      processedItems++;
    }

    // ── 7. Horizon notes (upsert) ─────────────────────────────────────────
    for (let i = 0; i < preview.horizonNotes.length; i++) {
      const note = preview.horizonNotes[i];
      try {
        const level = note.level as
          | "RUNWAY"
          | "HORIZON_1"
          | "HORIZON_2"
          | "HORIZON_3"
          | "HORIZON_4"
          | "HORIZON_5";

        // Check if one exists — if so, skip (horizon notes are personal and level-unique)
        const existing = await prisma.horizonNote.findFirst({
          where: { userId, level },
        });
        if (existing) {
          skippedItems++;
        } else {
          await prisma.horizonNote.create({
            data: {
              level,
              title: note.title || level,
              content: note.content,
              userId,
            },
          });
          createdItems++;
        }
      } catch (err) {
        errors.push({
          entity: "horizonNote",
          index: i,
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
      processedItems++;
    }

    // ── 8. Wiki articles ───────────────────────────────────────────────────
    for (let i = 0; i < preview.wikiArticles.length; i++) {
      const article = preview.wikiArticles[i];
      try {
        if (article.isDuplicate) {
          skippedItems++;
        } else {
          await prisma.wikiArticle.create({
            data: {
              title: article.title,
              slug: article.slug,
              content: article.content,
              tags: article.tags,
              userId,
            },
          });
          createdItems++;
        }
      } catch (err) {
        errors.push({
          entity: "wikiArticle",
          index: i,
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
      processedItems++;
    }

    // ── 9. Waiting for ─────────────────────────────────────────────────────
    for (let i = 0; i < preview.waitingFor.length; i++) {
      const wf = preview.waitingFor[i];
      try {
        await prisma.waitingFor.create({
          data: {
            description: wf.description,
            person: wf.person,
            dueDate: wf.dueDate ? new Date(wf.dueDate) : undefined,
            followUpDate: wf.followUpDate
              ? new Date(wf.followUpDate)
              : undefined,
            isResolved: wf.isResolved ?? false,
            userId,
          },
        });
        createdItems++;
      } catch (err) {
        errors.push({
          entity: "waitingFor",
          index: i,
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
      processedItems++;
    }

    // ── 10. Recurring templates → Simple Routines ──────────────────────────
    for (let i = 0; i < preview.recurringTemplates.length; i++) {
      const tmpl = preview.recurringTemplates[i];
      try {
        await prisma.routine.create({
          data: {
            title: tmpl.title,
            description: tmpl.description ?? undefined,
            cronExpression: tmpl.cronExpression,
            taskDefaults: tmpl.taskDefaults
              ? (tmpl.taskDefaults as Prisma.InputJsonValue)
              : undefined,
            isActive: tmpl.isActive ?? true,
            userId,
          },
        });
        createdItems++;
      } catch (err) {
        errors.push({
          entity: "recurringTemplate",
          index: i,
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
      processedItems++;
    }

    // ── 11. Weekly reviews ─────────────────────────────────────────────────
    for (let i = 0; i < preview.weeklyReviews.length; i++) {
      const review = preview.weeklyReviews[i];
      try {
        await prisma.weeklyReview.create({
          data: {
            status:
              (review.status as "IN_PROGRESS" | "COMPLETED") || "IN_PROGRESS",
            weekOf: new Date(review.weekOf),
            notes: review.notes ?? undefined,
            checklist: review.checklist
              ? (review.checklist as Prisma.InputJsonValue)
              : undefined,
            completedAt: review.completedAt
              ? new Date(review.completedAt)
              : undefined,
            aiCoachUsed: review.aiCoachUsed ?? false,
            userId,
          },
        });
        createdItems++;
      } catch (err) {
        errors.push({
          entity: "weeklyReview",
          index: i,
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
      processedItems++;
    }

    // ── Update job ─────────────────────────────────────────────────────────
    await prisma.importJob.update({
      where: { id: jobId },
      data: {
        status: "COMPLETED",
        processedItems,
        createdItems,
        skippedItems,
        errorCount: errors.length,
        errors: errors.length > 0 ? (errors as unknown as Prisma.InputJsonValue) : undefined,
        completedAt: new Date(),
      },
    });
  } catch (err) {
    // Unexpected top-level error
    await prisma.importJob.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        processedItems,
        createdItems,
        skippedItems,
        errorCount: errors.length + 1,
        errors: [
          ...errors,
          {
            entity: "job",
            index: 0,
            message: err instanceof Error ? err.message : "Unknown error",
          },
        ] as unknown as Prisma.InputJsonValue,
      },
    });
  }
}
