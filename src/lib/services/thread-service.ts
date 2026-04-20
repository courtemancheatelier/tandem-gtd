import { prisma } from "@/lib/prisma";
import { ThreadPurpose } from "@prisma/client";
import { writeTaskEvent, writeProjectEvent } from "@/lib/history/event-writer";
import { isTeamMember, isTeamAdmin } from "@/lib/services/team-permissions";
import { sendPushToUser } from "@/lib/push";
import { runCascade } from "@/lib/cascade";
import type { ActorContext } from "@/lib/services/task-service";
import type { CreateThreadInput, AddMessageInput } from "@/lib/validations/thread";
import { createInboxItem } from "@/lib/services/inbox-service";
import { createTask } from "@/lib/services/task-service";

// ─── Access helpers ─────────────────────────────────────────────────

/**
 * Resolve the teamId for a thread anchor (task or project).
 * Returns null if the anchor is not a team entity.
 */
async function resolveAnchorTeam(
  taskId?: string,
  projectId?: string
): Promise<{ teamId: string | null; anchorTaskId?: string; anchorProjectId?: string }> {
  if (taskId) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, project: { select: { teamId: true } } },
    });
    if (!task) throw new Error("Task not found");
    return { teamId: task.project?.teamId ?? null, anchorTaskId: task.id };
  }
  if (projectId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, teamId: true },
    });
    if (!project) throw new Error("Project not found");
    return { teamId: project.teamId, anchorProjectId: project.id };
  }
  throw new Error("No anchor provided");
}

async function assertTeamAccess(userId: string, teamId: string | null) {
  if (!teamId) throw new Error("Threads require a team context");
  const member = await isTeamMember(userId, teamId);
  if (!member) throw new Error("Not a member of this team");
}

// ─── Create Thread ──────────────────────────────────────────────────

export async function createThread(
  userId: string,
  input: CreateThreadInput,
  actor: ActorContext
) {
  const { teamId } = await resolveAnchorTeam(input.taskId, input.projectId);
  await assertTeamAccess(userId, teamId);

  // Check if threads are enabled for this project
  const anchorProjectId = input.projectId || (input.taskId
    ? (await prisma.task.findUnique({ where: { id: input.taskId }, select: { projectId: true } }))?.projectId
    : null);
  if (anchorProjectId) {
    const proj = await prisma.project.findUnique({ where: { id: anchorProjectId }, select: { threadsEnabled: true } });
    if (proj && !proj.threadsEnabled) throw new Error("Threads are disabled for this project");
  }

  // Fetch author name for notification context
  const author = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true },
  });
  const authorName = author?.name ?? "Someone";

  let mentionedUserIds: string[] = [];

  const thread = await prisma.$transaction(async (tx) => {
    // Create the thread
    const thread = await tx.thread.create({
      data: {
        purpose: input.purpose as ThreadPurpose,
        title: input.title,
        createdById: userId,
        taskId: input.taskId,
        projectId: input.projectId,
      },
    });

    // Create the first message
    const message = await tx.threadMessage.create({
      data: {
        threadId: thread.id,
        authorId: userId,
        content: input.message,
      },
    });

    // Process @-mentions (create inbox items + notifications for non-FYI)
    if (input.mentions?.length) {
      mentionedUserIds = await processMentions(
        tx, thread.id, message.id, input.mentions, input.purpose, userId,
        { taskId: input.taskId, projectId: input.projectId, authorName, threadTitle: input.title },
        teamId
      );
    }

    // BLOCKER: create WaitingFor + optionally set task to WAITING
    if (input.purpose === "BLOCKER") {
      await tx.waitingFor.create({
        data: {
          userId,
          description: `Blocker thread: ${input.title}`,
          person: "Team",
          threadId: thread.id,
        },
      });

      if (input.setTaskWaiting && input.taskId) {
        await tx.task.update({
          where: { id: input.taskId },
          data: { status: "WAITING", version: { increment: 1 } },
        });
      }
    }

    // Write event on the anchor
    const eventChanges = { threadId: { old: null, new: thread.id } };
    if (input.taskId) {
      await writeTaskEvent(tx, input.taskId, "THREAD_OPENED", eventChanges, {
        ...actor,
        message: `${input.purpose} thread: ${input.title}`,
      });
    } else if (input.projectId) {
      await writeProjectEvent(tx, input.projectId, "THREAD_OPENED", eventChanges, {
        ...actor,
        message: `${input.purpose} thread: ${input.title}`,
      });
    }

    return thread;
  });

  // Send push notifications to mentioned users (fire-and-forget)
  for (const uid of mentionedUserIds) {
    const link = input.taskId ? `/tasks/${input.taskId}` : input.projectId ? `/projects/${input.projectId}` : undefined;
    sendPushToUser(uid, {
      title: `${authorName} mentioned you`,
      body: `${input.purpose.toLowerCase()} thread: ${input.title}`,
      url: link,
      tag: `thread-mention-${thread.id}`,
    }).catch(() => {}); // fire-and-forget
  }

  return prisma.thread.findUnique({
    where: { id: thread.id },
    include: {
      messages: {
        include: {
          author: { select: { id: true, name: true } },
          reactions: {
            include: { user: { select: { id: true, name: true } } },
          },
        },
      },
      createdBy: { select: { id: true, name: true } },
    },
  });
}

// ─── Resolve Thread ─────────────────────────────────────────────────

export async function resolveThread(
  threadId: string,
  userId: string,
  actor: ActorContext
) {
  const thread = await prisma.thread.findUnique({
    where: { id: threadId },
    include: { waitingFors: { where: { isResolved: false } } },
  });
  if (!thread) throw new Error("Thread not found");

  const { teamId } = await resolveAnchorTeam(thread.taskId ?? undefined, thread.projectId ?? undefined);
  await assertTeamAccess(userId, teamId);

  await prisma.$transaction(async (tx) => {
    // Resolve the thread
    await tx.thread.update({
      where: { id: threadId },
      data: {
        isResolved: true,
        resolvedAt: new Date(),
        resolvedById: userId,
      },
    });

    // Auto-resolve linked WaitingFor entries
    if (thread.waitingFors.length > 0) {
      await tx.waitingFor.updateMany({
        where: { threadId, isResolved: false },
        data: { isResolved: true, resolvedAt: new Date() },
      });
    }

    // If BLOCKER and task was WAITING, set back to IN_PROGRESS
    if (thread.purpose === "BLOCKER" && thread.taskId) {
      const task = await tx.task.findUnique({
        where: { id: thread.taskId },
        select: { status: true },
      });
      if (task?.status === "WAITING") {
        await tx.task.update({
          where: { id: thread.taskId },
          data: { status: "IN_PROGRESS", version: { increment: 1 } },
        });
      }
    }

    // Write event
    const eventChanges = { threadId: { old: threadId, new: null } };
    if (thread.taskId) {
      await writeTaskEvent(tx, thread.taskId, "THREAD_RESOLVED", eventChanges, {
        ...actor,
        message: `Resolved: ${thread.title}`,
      });
    } else if (thread.projectId) {
      await writeProjectEvent(tx, thread.projectId, "THREAD_RESOLVED", eventChanges, {
        ...actor,
        message: `Resolved: ${thread.title}`,
      });
    }
  });

  // Run cascade after BLOCKER resolution to promote dependent tasks
  if (thread.purpose === "BLOCKER" && thread.taskId) {
    const task = await prisma.task.findUnique({
      where: { id: thread.taskId },
      select: { status: true },
    });
    if (task?.status === "IN_PROGRESS") {
      await runCascade(thread.taskId, userId);
    }
  }

  return prisma.thread.findUnique({
    where: { id: threadId },
    include: {
      messages: {
        include: {
          author: { select: { id: true, name: true } },
          reactions: {
            include: { user: { select: { id: true, name: true } } },
          },
        },
      },
      createdBy: { select: { id: true, name: true } },
      resolvedBy: { select: { id: true, name: true } },
    },
  });
}

// ─── Add Message ────────────────────────────────────────────────────

export async function addMessage(
  threadId: string,
  userId: string,
  input: AddMessageInput
) {
  const thread = await prisma.thread.findUnique({
    where: { id: threadId },
  });
  if (!thread) throw new Error("Thread not found");

  const { teamId } = await resolveAnchorTeam(thread.taskId ?? undefined, thread.projectId ?? undefined);
  await assertTeamAccess(userId, teamId);

  // Fetch author name for notification context
  const author = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true },
  });
  const authorName = author?.name ?? "Someone";

  let mentionedUserIds: string[] = [];

  const message = await prisma.$transaction(async (tx) => {
    // If thread was resolved, reopen it
    if (thread.isResolved) {
      await tx.thread.update({
        where: { id: threadId },
        data: {
          isResolved: false,
          resolvedAt: null,
          resolvedById: null,
        },
      });
    }

    const message = await tx.threadMessage.create({
      data: {
        threadId,
        authorId: userId,
        content: input.content,
      },
      include: {
        author: { select: { id: true, name: true } },
      },
    });

    if (input.mentions?.length) {
      mentionedUserIds = await processMentions(
        tx, threadId, message.id, input.mentions, thread.purpose, userId,
        { taskId: thread.taskId ?? undefined, projectId: thread.projectId ?? undefined, authorName, threadTitle: thread.title },
        teamId
      );
    }

    return message;
  });

  // Send push notifications to mentioned users (fire-and-forget)
  for (const uid of mentionedUserIds) {
    const link = thread.taskId ? `/tasks/${thread.taskId}` : thread.projectId ? `/projects/${thread.projectId}` : undefined;
    sendPushToUser(uid, {
      title: `${authorName} mentioned you`,
      body: `Reply in thread: ${thread.title}`,
      url: link,
      tag: `thread-mention-${threadId}`,
    }).catch(() => {}); // fire-and-forget
  }

  return message;
}

// ─── Reactions ─────────────────────────────────────────────────────

export async function addReaction(
  messageId: string,
  userId: string,
  emoji: string
) {
  const message = await prisma.threadMessage.findUnique({
    where: { id: messageId },
    include: { thread: true },
  });
  if (!message) throw new Error("Message not found");

  const { teamId } = await resolveAnchorTeam(
    message.thread.taskId ?? undefined,
    message.thread.projectId ?? undefined
  );
  await assertTeamAccess(userId, teamId);

  return prisma.threadReaction.upsert({
    where: {
      messageId_userId_emoji: { messageId, userId, emoji },
    },
    create: { messageId, userId, emoji },
    update: {},
    include: { user: { select: { id: true, name: true } } },
  });
}

export async function removeReaction(
  messageId: string,
  userId: string,
  emoji: string
) {
  const message = await prisma.threadMessage.findUnique({
    where: { id: messageId },
    include: { thread: true },
  });
  if (!message) throw new Error("Message not found");

  const { teamId } = await resolveAnchorTeam(
    message.thread.taskId ?? undefined,
    message.thread.projectId ?? undefined
  );
  await assertTeamAccess(userId, teamId);

  await prisma.threadReaction.deleteMany({
    where: { messageId, userId, emoji },
  });
}

// ─── Edit / Delete Message ──────────────────────────────────────────

export async function editMessage(
  messageId: string,
  userId: string,
  content: string
) {
  const message = await prisma.threadMessage.findUnique({
    where: { id: messageId },
    include: { thread: true },
  });
  if (!message) throw new Error("Message not found");

  // Only the author or team admin can edit
  if (message.authorId !== userId) {
    const { teamId } = await resolveAnchorTeam(
      message.thread.taskId ?? undefined,
      message.thread.projectId ?? undefined
    );
    if (!teamId || !(await isTeamAdmin(userId, teamId))) {
      throw new Error("Not authorized to edit this message");
    }
  }

  return prisma.threadMessage.update({
    where: { id: messageId },
    data: { content, isEdited: true },
    include: { author: { select: { id: true, name: true } } },
  });
}

export async function deleteMessage(
  messageId: string,
  userId: string
) {
  const message = await prisma.threadMessage.findUnique({
    where: { id: messageId },
    include: { thread: true },
  });
  if (!message) throw new Error("Message not found");

  if (message.authorId !== userId) {
    const { teamId } = await resolveAnchorTeam(
      message.thread.taskId ?? undefined,
      message.thread.projectId ?? undefined
    );
    if (!teamId || !(await isTeamAdmin(userId, teamId))) {
      throw new Error("Not authorized to delete this message");
    }
  }

  await prisma.threadMessage.delete({ where: { id: messageId } });
}

// ─── List Threads ───────────────────────────────────────────────────

export async function listThreads(options: {
  taskId?: string;
  projectId?: string;
  includeResolved?: boolean;
}) {
  const where: Record<string, unknown> = {};
  if (options.taskId) where.taskId = options.taskId;
  if (options.projectId) where.projectId = options.projectId;
  if (!options.includeResolved) where.isResolved = false;

  return prisma.thread.findMany({
    where,
    include: {
      createdBy: { select: { id: true, name: true } },
      resolvedBy: { select: { id: true, name: true } },
      messages: {
        include: {
          author: { select: { id: true, name: true } },
          reactions: {
            include: { user: { select: { id: true, name: true } } },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      _count: { select: { messages: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

// ─── Get Single Thread ──────────────────────────────────────────────

export async function getThread(threadId: string) {
  return prisma.thread.findUnique({
    where: { id: threadId },
    include: {
      createdBy: { select: { id: true, name: true } },
      resolvedBy: { select: { id: true, name: true } },
      messages: {
        include: {
          author: { select: { id: true, name: true } },
          mentions: {
            include: { user: { select: { id: true, name: true } } },
          },
          reactions: {
            include: { user: { select: { id: true, name: true } } },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      _count: { select: { messages: true } },
    },
  });
}

// ─── Access Control ─────────────────────────────────────────────────

/**
 * Verify that a user has access to a thread via team membership.
 * Throws if the thread doesn't exist or the user isn't a team member.
 */
export async function assertThreadAccess(threadId: string, userId: string) {
  const thread = await prisma.thread.findUnique({
    where: { id: threadId },
    select: { taskId: true, projectId: true },
  });
  if (!thread) throw new Error("Thread not found");

  const { teamId } = await resolveAnchorTeam(thread.taskId ?? undefined, thread.projectId ?? undefined);
  await assertTeamAccess(userId, teamId);
}

// ─── Mention Processing ─────────────────────────────────────────────

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

interface MentionContext {
  taskId?: string;
  projectId?: string;
  authorName: string;
  threadTitle: string;
}

async function processMentions(
  tx: TxClient,
  threadId: string,
  messageId: string,
  userIds: string[],
  purpose: string,
  authorId: string,
  ctx?: MentionContext,
  teamId?: string | null
): Promise<string[]> {
  const mentionedIds: string[] = [];

  // Create mention records — only for team members
  for (const userId of userIds) {
    if (userId === authorId) continue; // Don't mention yourself
    if (teamId) {
      const member = await isTeamMember(userId, teamId);
      if (!member) continue; // Skip non-team-members
    }
    await (tx as unknown as typeof prisma).threadMention.create({
      data: { threadId, messageId, userId },
    });
    mentionedIds.push(userId);
  }

  // FYI threads don't create inbox items or notifications
  if (purpose === "FYI") return mentionedIds;

  // Create inbox items + notifications for mentioned users
  const link = ctx?.taskId
    ? `/tasks/${ctx.taskId}`
    : ctx?.projectId
      ? `/projects/${ctx.projectId}`
      : null;

  for (const userId of mentionedIds) {
    await (tx as unknown as typeof prisma).inboxItem.create({
      data: {
        userId,
        content: `You were mentioned in a ${purpose.toLowerCase()} thread`,
      },
    });

    // Create notification record
    await (tx as unknown as typeof prisma).notification.create({
      data: {
        userId,
        type: "THREAD_MENTION",
        title: `${ctx?.authorName ?? "Someone"} mentioned you in "${ctx?.threadTitle ?? "a thread"}"`,
        body: `${purpose.toLowerCase()} thread`,
        link,
        taskId: ctx?.taskId ?? null,
      },
    });
  }

  return mentionedIds;
}

// ─── Message → Inbox / Task Conversion ──────────────────────────────

/**
 * Convert a thread message into an inbox item.
 * Preserves thread context (title, author, link) in the notes field.
 */
export async function convertMessageToInbox(
  messageId: string,
  userId: string
) {
  const message = await prisma.threadMessage.findUnique({
    where: { id: messageId },
    include: {
      author: { select: { name: true } },
      thread: {
        select: {
          id: true,
          title: true,
          taskId: true,
          projectId: true,
        },
      },
    },
  });
  if (!message) throw new Error("Message not found");

  // Verify team access
  const { teamId } = await resolveAnchorTeam(
    message.thread.taskId ?? undefined,
    message.thread.projectId ?? undefined
  );
  await assertTeamAccess(userId, teamId);

  const link = message.thread.taskId
    ? `/tasks/${message.thread.taskId}`
    : message.thread.projectId
      ? `/projects/${message.thread.projectId}`
      : null;

  const notes = [
    `From thread: "${message.thread.title}"`,
    `Author: ${message.author.name}`,
    ...(link ? [`Link: ${link}`] : []),
  ].join("\n");

  const actor: ActorContext = {
    actorType: "USER",
    actorId: userId,
    source: "TEAM_SYNC",
    message: "Converted from thread message",
  };

  return createInboxItem(userId, {
    content: message.content.slice(0, 500),
    notes,
    sourceLabel: "thread",
  }, actor);
}

/**
 * Convert a thread message into a task.
 * Preserves thread context (title, author, link) in the notes field.
 */
export async function convertMessageToTask(
  messageId: string,
  userId: string,
  options?: { projectId?: string; contextId?: string; isNextAction?: boolean }
) {
  const message = await prisma.threadMessage.findUnique({
    where: { id: messageId },
    include: {
      author: { select: { name: true } },
      thread: {
        select: {
          id: true,
          title: true,
          taskId: true,
          projectId: true,
        },
      },
    },
  });
  if (!message) throw new Error("Message not found");

  // Verify team access
  const { teamId } = await resolveAnchorTeam(
    message.thread.taskId ?? undefined,
    message.thread.projectId ?? undefined
  );
  await assertTeamAccess(userId, teamId);

  const link = message.thread.taskId
    ? `/tasks/${message.thread.taskId}`
    : message.thread.projectId
      ? `/projects/${message.thread.projectId}`
      : null;

  const notes = [
    `From thread: "${message.thread.title}"`,
    `Author: ${message.author.name}`,
    ...(link ? [`Link: ${link}`] : []),
  ].join("\n");

  const actor: ActorContext = {
    actorType: "USER",
    actorId: userId,
    source: "TEAM_SYNC",
    message: "Converted from thread message",
  };

  // Truncate message content to fit task title (200 chars)
  const title = message.content.length > 200
    ? message.content.slice(0, 197) + "..."
    : message.content;

  return createTask(userId, {
    title,
    notes,
    projectId: options?.projectId,
    contextId: options?.contextId,
  }, actor);
}
