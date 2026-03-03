import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound, badRequest } from "@/lib/api/auth-helpers";
import { z } from "zod";
import { createTask } from "@/lib/services/task-service";
import { createProject } from "@/lib/services/project-service";
import { writeInboxEvent } from "@/lib/history/event-writer";

const processPayloadSchema = z.object({
  decision: z.enum(["actionable", "not_actionable"]),
  // Actionable fields
  taskTitle: z.string().min(1).max(500).optional(),
  projectId: z.string().optional(),
  newProjectTitle: z.string().min(1).max(200).optional(),
  contextId: z.string().optional(),
  energyLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  estimatedMins: z.number().int().positive().optional(),
  scheduledDate: z.string().optional(),
  dueDate: z.string().optional(),
  delegateTo: z.string().min(1).max(100).optional(),
  twoMinuteTask: z.boolean().optional(),
  // Not actionable fields
  disposition: z.enum(["trash", "someday", "reference"]).optional(),
  referenceTitle: z.string().min(1).max(200).optional(),
  referenceContent: z.string().optional(),
  somedayTitle: z.string().min(1).max(200).optional(),
});

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const inboxItem = await prisma.inboxItem.findFirst({
    where: { id: params.id, userId },
  });
  if (!inboxItem) return notFound("Inbox item not found");

  if (inboxItem.status !== "UNPROCESSED") {
    return badRequest("Inbox item has already been processed");
  }

  const body = await req.json();
  const parsed = processPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  const data = parsed.data;
  const created: Record<string, unknown> = {};

  if (data.decision === "not_actionable") {
    if (!data.disposition) {
      return badRequest("Disposition is required for non-actionable items");
    }

    switch (data.disposition) {
      case "trash": {
        await prisma.inboxItem.update({
          where: { id: params.id },
          data: { status: "DELETED" },
        });
        created.disposition = "trash";
        break;
      }

      case "someday": {
        const title = data.somedayTitle || inboxItem.content;
        const project = await createProject(
          userId,
          {
            title,
            description: inboxItem.notes || undefined,
            isSomedayMaybe: true,
            type: "PARALLEL",
            childType: "SEQUENTIAL",
          },
          { actorType: "USER", actorId: userId, source: "MANUAL" }
        );
        // Set someday/maybe status (not in CreateProjectInput schema)
        await prisma.project.update({
          where: { id: project.id },
          data: { status: "SOMEDAY_MAYBE", version: { increment: 1 } },
        });
        await prisma.inboxItem.update({
          where: { id: params.id },
          data: { status: "PROCESSED" },
        });
        created.project = project;
        created.disposition = "someday";
        break;
      }

      case "reference": {
        const title = data.referenceTitle || inboxItem.content;
        const baseSlug = slugify(title);
        // Ensure unique slug for this user
        let slug = baseSlug;
        let counter = 1;
        while (true) {
          const existing = await prisma.wikiArticle.findFirst({
            where: { userId, slug },
          });
          if (!existing) break;
          slug = `${baseSlug}-${counter}`;
          counter++;
        }
        const content = data.referenceContent || inboxItem.notes || inboxItem.content;
        const article = await prisma.wikiArticle.create({
          data: {
            title,
            slug,
            content,
            tags: [],
            userId,
          },
        });
        await prisma.inboxItem.update({
          where: { id: params.id },
          data: { status: "PROCESSED" },
        });
        created.wikiArticle = article;
        created.disposition = "reference";
        break;
      }
    }
  } else {
    // Actionable
    const taskTitle = data.taskTitle || inboxItem.content;
    let projectId = data.projectId;

    // Create new project if requested
    if (data.newProjectTitle) {
      const project = await createProject(
        userId,
        { title: data.newProjectTitle, type: "PARALLEL", childType: "SEQUENTIAL", isSomedayMaybe: false },
        { actorType: "USER", actorId: userId, source: "MANUAL" }
      );
      projectId = project.id;
      created.project = project;
    }

    // Validate projectId belongs to user if provided
    if (projectId) {
      const project = await prisma.project.findFirst({
        where: { id: projectId, userId },
      });
      if (!project) {
        return badRequest("Project not found");
      }
    }

    // Validate contextId belongs to user if provided
    if (data.contextId) {
      const context = await prisma.context.findFirst({
        where: { id: data.contextId, userId },
      });
      if (!context) {
        return badRequest("Context not found");
      }
    }

    const actorCtx = { actorType: "USER" as const, actorId: userId, source: "MANUAL" as const };

    // Create task via service layer (handles isNextAction, project reactivation, CREATED event)
    const task = await createTask(
      userId,
      {
        title: taskTitle,
        notes: inboxItem.notes || undefined,
        projectId: projectId || undefined,
        contextId: data.contextId || undefined,
        energyLevel: data.energyLevel || undefined,
        estimatedMins: data.estimatedMins || undefined,
        scheduledDate: data.scheduledDate || undefined,
        dueDate: data.dueDate || undefined,
      },
      actorCtx
    );

    // For two-minute tasks, mark as completed immediately
    if (data.twoMinuteTask) {
      const { completeTask } = await import("@/lib/services/task-service");
      await completeTask(task.id, userId, actorCtx);
    }

    created.task = task;

    // Create waiting-for if delegated
    if (data.delegateTo) {
      const waitingFor = await prisma.waitingFor.create({
        data: {
          description: taskTitle,
          person: data.delegateTo,
          userId,
          dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        },
      });
      created.waitingFor = waitingFor;
    }

    await prisma.inboxItem.update({
      where: { id: params.id },
      data: { status: "PROCESSED" },
    });
  }

  // Write PROCESSED event for the inbox item
  await writeInboxEvent(
    prisma,
    params.id,
    "PROCESSED",
    {
      status: { old: "UNPROCESSED", new: data.decision === "not_actionable" ? data.disposition ?? "trash" : "PROCESSED" },
      decision: { old: null, new: data.decision },
    },
    { actorType: "USER", actorId: userId, source: "MANUAL" }
  );

  return NextResponse.json({
    success: true,
    inboxItemId: params.id,
    ...created,
  });
}
