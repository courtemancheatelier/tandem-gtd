import { prisma } from "@/lib/prisma";
import { writeTaskEvent, writeProjectEvent } from "@/lib/history/event-writer";
import { isTeamMember } from "@/lib/services/team-permissions";
import { sendPushToUser } from "@/lib/push";
import { canPushToUser } from "@/lib/push-gate";
import { runCascade } from "@/lib/cascade";
import type { ActorContext } from "@/lib/services/task-service";
import type { CreateDecisionInput, RespondDecisionInput, VoteOptionInput, CreateContributionInput, PublishDecisionInput, ResolveProposalInput, CreateInputRequestInput, UpdateInputRequestInput } from "@/lib/validations/decision";

// ─── Access helper ──────────────────────────────────────────────────

async function resolveAnchorTeam(taskId?: string, projectId?: string) {
  if (taskId) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { project: { select: { teamId: true } } },
    });
    if (!task) throw new Error("Task not found");
    return task.project?.teamId ?? null;
  }
  if (projectId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { teamId: true },
    });
    if (!project) throw new Error("Project not found");
    return project.teamId;
  }
  throw new Error("No anchor provided");
}

// ─── Shared include for decision queries ────────────────────────────

const decisionInclude = {
  thread: { select: { id: true, taskId: true, projectId: true, project: { select: { teamId: true } }, task: { select: { project: { select: { teamId: true } } } } } },
  requester: { select: { id: true, name: true } },
  respondents: { include: { user: { select: { id: true, name: true } }, task: { select: { id: true, status: true } } } },
  responses: { include: { user: { select: { id: true, name: true } } } },
  options: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      votes: {
        include: { voter: { select: { id: true, name: true } } },
      },
    },
  },
  optionVotes: {
    include: { voter: { select: { id: true, name: true } } },
  },
  contributions: {
    include: { author: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" as const },
  },
  inputRequests: {
    include: {
      assignee: { select: { id: true, name: true } },
      task: { select: { id: true, status: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
  events: {
    include: { actor: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" as const },
  },
  project: { select: { id: true, title: true, teamId: true } },
  wikiArticle: { select: { id: true, title: true, slug: true } },
};

// ─── Create Decision ────────────────────────────────────────────────

export async function createDecision(
  userId: string,
  input: CreateDecisionInput,
  actor: ActorContext
) {
  const teamId = await resolveAnchorTeam(input.taskId, input.projectId);
  if (!teamId) throw new Error("Decisions require a team context");
  if (!(await isTeamMember(userId, teamId))) throw new Error("Not a member of this team");

  // Check if decisions are enabled for the anchor project
  const anchorProjectId = input.projectId || (input.taskId
    ? (await prisma.task.findUnique({ where: { id: input.taskId }, select: { projectId: true } }))?.projectId
    : null);
  if (anchorProjectId) {
    const proj = await prisma.project.findUnique({ where: { id: anchorProjectId }, select: { decisionsEnabled: true } });
    if (proj && !proj.decisionsEnabled) throw new Error("Decisions are disabled for this project");
  }

  const notifyUserIds: string[] = [];
  const isPoll = input.decisionType === "POLL" || input.decisionType === "QUICK_POLL";
  const isProposal = input.decisionType === "PROPOSAL";
  const typeLabel = isProposal ? "Proposal" : isPoll ? "Poll" : "Decision";

  const result = await prisma.$transaction(async (tx) => {
    // Create the thread (QUESTION purpose)
    const thread = await tx.thread.create({
      data: {
        purpose: "QUESTION",
        title: input.question.slice(0, 100),
        createdById: userId,
        taskId: input.taskId,
        projectId: input.projectId,
      },
    });

    // Create the first message
    await tx.threadMessage.create({
      data: {
        threadId: thread.id,
        authorId: userId,
        content: input.context
          ? `**${typeLabel}:** ${input.question}\n\n${input.context}`
          : `**${typeLabel}:** ${input.question}`,
      },
    });

    // Create the decision request
    const decision = await tx.decisionRequest.create({
      data: {
        question: input.question,
        context: input.context,
        decisionType: input.decisionType ?? "APPROVAL",
        status: isProposal ? "DRAFT" : "OPEN",
        threadId: thread.id,
        requesterId: userId,
        deadline: input.deadline ? new Date(input.deadline) : undefined,
        wikiSlug: input.wikiSlug,
        // Proposal-specific fields
        description: isProposal ? input.description : undefined,
        wikiArticleId: isProposal ? input.wikiArticleId : undefined,
        wikiSection: isProposal ? input.wikiSection : undefined,
        projectId: isProposal ? input.projectId : undefined,
      },
    });

    // Record creation event for proposals
    if (isProposal) {
      await tx.decisionEvent.create({
        data: {
          decisionId: decision.id,
          actorId: userId,
          type: "CREATED",
          message: `Proposal created: ${input.question.slice(0, 100)}`,
        },
      });
    }

    // Create options for POLL/QUICK_POLL type
    if (isPoll && input.options) {
      for (let i = 0; i < input.options.length; i++) {
        await tx.decisionOption.create({
          data: {
            decisionId: decision.id,
            label: input.options[i].label,
            description: input.options[i].description,
            sortOrder: i,
          },
        });
      }
    }

    // For proposals in DRAFT, skip respondent task generation (happens on publish)
    const validRespondentIds: string[] = [];
    if (!isProposal) {
      const taskTitle = isPoll
        ? `Vote on: ${input.question.slice(0, 80)}`
        : `Review and approve: ${input.question.slice(0, 60)}`;
      const taskNotes = [
        input.context ? input.context.slice(0, 500) : null,
        `\nOpen the decision to see details and submit your response.\n/decisions/${decision.id}`,
      ].filter(Boolean).join("\n\n");

      for (const respondentId of input.respondentIds) {
        if (await isTeamMember(respondentId, teamId)) {
          validRespondentIds.push(respondentId);
          const task = await tx.task.create({
            data: {
              title: taskTitle,
              notes: taskNotes,
              userId: respondentId,
              energyLevel: "LOW",
              estimatedMins: 5,
              dueDate: input.deadline ? new Date(input.deadline) : undefined,
              status: "NOT_STARTED",
              isNextAction: true,
            },
          });
          await tx.decisionRespondent.create({
            data: {
              decisionId: decision.id,
              userId: respondentId,
              taskId: task.id,
            },
          });
        }
      }
      if (validRespondentIds.length === 0) {
        throw new Error("No valid team members in respondent list");
      }

      // Create WaitingFor for requester
      await tx.waitingFor.create({
        data: {
          userId,
          description: `${typeLabel}: ${input.question.slice(0, 100)}`,
          person: "Team",
          dueDate: input.deadline ? new Date(input.deadline) : undefined,
          threadId: thread.id,
        },
      });

      // Create inbox items and notifications for respondents
      const link = `/decisions/${decision.id}`;
      for (const respondentId of validRespondentIds) {
        if (respondentId === userId) continue;
        await tx.inboxItem.create({
          data: {
            userId: respondentId,
            content: `${typeLabel} requested: ${input.question.slice(0, 100)}`,
          },
        });
        await tx.notification.create({
          data: {
            type: "DECISION_REQUESTED",
            title: `${typeLabel} requested`,
            body: input.question.slice(0, 200),
            link,
            userId: respondentId,
          },
        });
        notifyUserIds.push(respondentId);
      }
    } else {
      // Proposal: validate respondents but don't generate tasks yet
      for (const respondentId of input.respondentIds) {
        if (await isTeamMember(respondentId, teamId)) {
          validRespondentIds.push(respondentId);
          await tx.decisionRespondent.create({
            data: {
              decisionId: decision.id,
              userId: respondentId,
            },
          });
        }
      }
      if (validRespondentIds.length === 0) {
        throw new Error("No valid team members in respondent list");
      }
    }

    // Write event
    const eventChanges = { decisionId: { old: null, new: decision.id } };
    if (input.taskId) {
      await writeTaskEvent(tx, input.taskId, "DECISION_REQUESTED", eventChanges, {
        ...actor,
        message: `${typeLabel}: ${input.question.slice(0, 100)}`,
      });
    } else if (input.projectId) {
      await writeProjectEvent(tx, input.projectId, "DECISION_REQUESTED", eventChanges, {
        ...actor,
        message: `${typeLabel}: ${input.question.slice(0, 100)}`,
      });
    }

    return tx.decisionRequest.findUnique({
      where: { id: decision.id },
      include: decisionInclude,
    });
  });

  // Send push notifications (fire-and-forget, after transaction)
  const pushLink = `/decisions/${result?.id}`;
  for (const uid of notifyUserIds) {
    canPushToUser(uid, "decisions").then((allowed) => {
      if (allowed) {
        sendPushToUser(uid, {
          title: `${typeLabel} requested`,
          body: input.question.slice(0, 100),
          url: pushLink,
          tag: `decision-requested-${result?.id}`,
        }).catch(() => {});
      }
    }).catch(() => {});
  }

  return result;
}

// ─── Respond to Decision (APPROVAL type) ────────────────────────────

export async function respondToDecision(
  decisionId: string,
  userId: string,
  input: RespondDecisionInput
) {
  const decision = await prisma.decisionRequest.findUnique({
    where: { id: decisionId },
    include: { respondents: true },
  });
  if (!decision) throw new Error("Decision not found");
  if (decision.status !== "OPEN") throw new Error("Decision is not open");

  // Must be a designated respondent
  if (!decision.respondents.some((r) => r.userId === userId)) {
    throw new Error("Not a designated respondent");
  }

  // Upsert response
  const response = await prisma.decisionResponse.upsert({
    where: { decisionId_userId: { decisionId, userId } },
    create: {
      decisionId,
      userId,
      vote: input.vote,
      comment: input.comment,
    },
    update: {
      vote: input.vote,
      comment: input.comment,
    },
    include: {
      user: { select: { id: true, name: true } },
    },
  });

  // Auto-complete respondent's linked task
  await autoCompleteRespondentTask(decisionId, userId);

  return response;
}

// ─── Vote for Option (POLL type) ────────────────────────────────────

export async function voteForOption(
  decisionId: string,
  userId: string,
  input: VoteOptionInput
) {
  const decision = await prisma.decisionRequest.findUnique({
    where: { id: decisionId },
    include: { respondents: true, options: true },
  });
  if (!decision) throw new Error("Decision not found");
  if (decision.status !== "OPEN") throw new Error("Decision is not open");
  if (decision.decisionType !== "POLL" && decision.decisionType !== "QUICK_POLL") throw new Error("This decision is not a poll");

  // Must be a designated respondent
  if (!decision.respondents.some((r) => r.userId === userId)) {
    throw new Error("Not a designated respondent");
  }

  // Validate option belongs to this decision
  if (!decision.options.some((o) => o.id === input.optionId)) {
    throw new Error("Option does not belong to this decision");
  }

  // Upsert vote (one per person per decision)
  const vote = await prisma.decisionOptionVote.upsert({
    where: { decisionId_voterId: { decisionId, voterId: userId } },
    create: {
      decisionId,
      optionId: input.optionId,
      voterId: userId,
      comment: input.comment,
    },
    update: {
      optionId: input.optionId,
      comment: input.comment,
    },
    include: {
      option: true,
      voter: { select: { id: true, name: true } },
    },
  });

  // Auto-complete respondent's linked task
  await autoCompleteRespondentTask(decisionId, userId);

  // Auto-resolve QUICK_POLL if all respondents have voted
  if (decision.decisionType === "QUICK_POLL") {
    await tryAutoResolveQuickPoll(decisionId);
  }

  return vote;
}

// ─── Auto-complete respondent task ──────────────────────────────────

async function autoCompleteRespondentTask(decisionId: string, userId: string) {
  const respondent = await prisma.decisionRespondent.findUnique({
    where: { decisionId_userId: { decisionId, userId } },
    select: { taskId: true },
  });
  if (respondent?.taskId) {
    await prisma.task.update({
      where: { id: respondent.taskId },
      data: { status: "COMPLETED", completedAt: new Date(), version: { increment: 1 } },
    }).catch(() => {}); // Task may already be completed
  }
}

// ─── Auto-resolve QUICK_POLL ────────────────────────────────────────

async function tryAutoResolveQuickPoll(decisionId: string) {
  const decision = await prisma.decisionRequest.findUnique({
    where: { id: decisionId },
    include: {
      respondents: true,
      optionVotes: true,
      options: { include: { votes: true } },
      thread: true,
    },
  });
  if (!decision || decision.status !== "OPEN") return;

  // Check if all respondents have voted
  const respondentIds = decision.respondents.map((r) => r.userId);
  const voterIds = new Set(decision.optionVotes.map((v) => v.voterId));
  const allVoted = respondentIds.every((id) => voterIds.has(id));
  if (!allVoted) return;

  // Find the winning option
  const optionVoteCounts = decision.options.map((o) => ({
    id: o.id,
    label: o.label,
    voteCount: o.votes.length,
  }));
  optionVoteCounts.sort((a, b) => b.voteCount - a.voteCount);

  // Check for tie
  if (
    optionVoteCounts.length >= 2 &&
    optionVoteCounts[0].voteCount === optionVoteCounts[1].voteCount
  ) {
    return; // Tied — leave open for owner to resolve
  }

  const winner = optionVoteCounts[0];
  const resolution = `Auto-resolved: ${winner.label} (${winner.voteCount} vote${winner.voteCount !== 1 ? "s" : ""})`;

  // Auto-resolve
  await prisma.$transaction(async (tx) => {
    await tx.decisionOption.updateMany({ where: { decisionId }, data: { isChosen: false } });
    await tx.decisionOption.update({ where: { id: winner.id }, data: { isChosen: true } });
    await tx.decisionRequest.update({
      where: { id: decisionId },
      data: { status: "RESOLVED", resolution, resolvedAt: new Date() },
    });
    await tx.thread.update({
      where: { id: decision.threadId },
      data: { isResolved: true, resolvedAt: new Date(), resolvedById: decision.requesterId },
    });
    await tx.waitingFor.updateMany({
      where: { threadId: decision.threadId, isResolved: false },
      data: { isResolved: true, resolvedAt: new Date() },
    });

    // Notify all respondents
    const link = `/decisions/${decisionId}`;
    for (const respondent of decision.respondents) {
      await tx.notification.create({
        data: {
          type: "DECISION_RESOLVED",
          title: "Poll auto-resolved",
          body: `${decision.question.slice(0, 100)}: ${resolution.slice(0, 100)}`,
          link,
          userId: respondent.userId,
        },
      });
    }
  });

  // Push notifications
  for (const respondent of decision.respondents) {
    canPushToUser(respondent.userId, "decisions").then((allowed) => {
      if (allowed) {
        sendPushToUser(respondent.userId, {
          title: "Poll auto-resolved",
          body: `${decision.question.slice(0, 100)}: ${resolution.slice(0, 100)}`,
          url: `/decisions/${decisionId}`,
          tag: `decision-resolved-${decisionId}`,
        }).catch(() => {});
      }
    }).catch(() => {});
  }

  // Wiki auto-update
  if (decision.wikiSlug) {
    appendDecisionToWiki(decision.wikiSlug, decision, resolution, decision.requesterId).catch(() => {});
  }
}

// ─── Contributions ──────────────────────────────────────────────────

export async function createContribution(
  decisionId: string,
  userId: string,
  input: CreateContributionInput
) {
  const decision = await prisma.decisionRequest.findUnique({
    where: { id: decisionId },
    include: { thread: { select: { projectId: true, taskId: true, project: { select: { teamId: true } }, task: { select: { project: { select: { teamId: true } } } } } } },
  });
  if (!decision) throw new Error("Decision not found");
  if (decision.status !== "OPEN") throw new Error("Decision is not open for contributions");

  // Verify team membership
  const teamId = decision.thread.project?.teamId ?? decision.thread.task?.project?.teamId ?? null;
  if (!teamId || !(await isTeamMember(userId, teamId))) {
    throw new Error("Not a member of this team");
  }

  return prisma.decisionContribution.create({
    data: {
      decisionId,
      authorId: userId,
      content: input.content,
    },
    include: {
      author: { select: { id: true, name: true } },
    },
  });
}

// ─── Complete remaining respondent tasks on decision close ──────────

async function completeRemainingRespondentTasks(decisionId: string) {
  const respondents = await prisma.decisionRespondent.findMany({
    where: { decisionId, taskId: { not: null } },
    select: { taskId: true },
  });
  for (const r of respondents) {
    if (r.taskId) {
      await prisma.task.updateMany({
        where: { id: r.taskId, status: { not: "COMPLETED" } },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
    }
  }
}

// ─── Resolve Decision ───────────────────────────────────────────────

export async function resolveDecision(
  decisionId: string,
  userId: string,
  resolution: string,
  actor: ActorContext,
  chosenOptionId?: string
) {
  const decision = await prisma.decisionRequest.findUnique({
    where: { id: decisionId },
    include: { thread: true, respondents: true },
  });
  if (!decision) throw new Error("Decision not found");
  if (decision.requesterId !== userId) throw new Error("Only the requester can resolve");
  if (decision.status !== "OPEN") throw new Error("Decision is not open");

  const result = await prisma.$transaction(async (tx) => {
    // Mark chosen option if provided
    if (chosenOptionId && decision.decisionType === "POLL") {
      // Verify the option belongs to this decision
      const option = await tx.decisionOption.findFirst({
        where: { id: chosenOptionId, decisionId },
      });
      if (!option) throw new Error("Option does not belong to this decision");

      // Reset all options first
      await tx.decisionOption.updateMany({
        where: { decisionId },
        data: { isChosen: false },
      });
      await tx.decisionOption.update({
        where: { id: chosenOptionId },
        data: { isChosen: true },
      });
    }

    // Resolve the decision
    await tx.decisionRequest.update({
      where: { id: decisionId },
      data: {
        status: "RESOLVED",
        resolution,
        resolvedAt: new Date(),
      },
    });

    // Resolve the parent thread
    await tx.thread.update({
      where: { id: decision.threadId },
      data: {
        isResolved: true,
        resolvedAt: new Date(),
        resolvedById: userId,
      },
    });

    // Auto-resolve linked WaitingFor
    await tx.waitingFor.updateMany({
      where: { threadId: decision.threadId, isResolved: false },
      data: { isResolved: true, resolvedAt: new Date() },
    });

    // If task was WAITING, restore to IN_PROGRESS
    if (decision.thread.taskId) {
      const task = await tx.task.findUnique({
        where: { id: decision.thread.taskId },
        select: { status: true },
      });
      if (task?.status === "WAITING") {
        await tx.task.update({
          where: { id: decision.thread.taskId },
          data: { status: "IN_PROGRESS", version: { increment: 1 } },
        });
      }
    }

    // Create notifications for all respondents
    const link = `/decisions/${decisionId}`;
    for (const respondent of decision.respondents) {
      await tx.notification.create({
        data: {
          type: "DECISION_RESOLVED",
          title: "Decision resolved",
          body: `${decision.question.slice(0, 100)}: ${resolution.slice(0, 100)}`,
          link,
          userId: respondent.userId,
        },
      });
    }

    // Write event
    const eventChanges = { decisionId: { old: decisionId, new: null } };
    if (decision.thread.taskId) {
      await writeTaskEvent(tx, decision.thread.taskId, "DECISION_RESOLVED", eventChanges, {
        ...actor,
        message: `Decision resolved: ${decision.question.slice(0, 100)}`,
      });
    } else if (decision.thread.projectId) {
      await writeProjectEvent(tx, decision.thread.projectId, "DECISION_RESOLVED", eventChanges, {
        ...actor,
        message: `Decision resolved: ${decision.question.slice(0, 100)}`,
      });
    }

    return tx.decisionRequest.findUnique({
      where: { id: decisionId },
      include: decisionInclude,
    });
  });

  // Run cascade if task transitioned from WAITING to IN_PROGRESS
  if (decision.thread.taskId) {
    const taskAfter = await prisma.task.findUnique({
      where: { id: decision.thread.taskId },
      select: { status: true },
    });
    if (taskAfter?.status === "IN_PROGRESS") {
      await runCascade(decision.thread.taskId, userId);
    }
  }

  // Send push notifications (fire-and-forget, after transaction)
  const pushLink = `/decisions/${decisionId}`;
  for (const respondent of decision.respondents) {
    canPushToUser(respondent.userId, "decisions").then((allowed) => {
      if (allowed) {
        sendPushToUser(respondent.userId, {
          title: "Decision resolved",
          body: `${decision.question.slice(0, 100)}: ${resolution.slice(0, 100)}`,
          url: pushLink,
          tag: `decision-resolved-${decisionId}`,
        }).catch(() => {});
      }
    }).catch(() => {});
  }

  // Complete remaining respondent tasks
  completeRemainingRespondentTasks(decisionId).catch(() => {});

  // Wiki auto-update (fire-and-forget, after transaction)
  if (decision.wikiSlug) {
    appendDecisionToWiki(decision.wikiSlug, decision, resolution, userId).catch((err) => {
      console.error("[decision] Failed to update wiki:", err);
    });
  }

  return result;
}

// ─── Wiki Auto-Update Helper ─────────────────────────────────────────

async function appendDecisionToWiki(
  wikiSlug: string,
  decision: { question: string; requesterId: string; thread: { projectId: string | null; taskId: string | null; project?: { teamId: string | null } | null; task?: { project: { teamId: string | null } | null } | null } },
  resolution: string,
  actorId: string
) {
  // Resolve team context
  const teamId = decision.thread.project?.teamId ?? decision.thread.task?.project?.teamId ?? null;
  if (!teamId) return;

  const article = await prisma.wikiArticle.findFirst({
    where: { slug: wikiSlug, teamId },
  });
  if (!article) return;

  const requester = await prisma.user.findUnique({
    where: { id: decision.requesterId },
    select: { name: true },
  });

  const dateStr = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const appendBlock = `\n\n---\n\n### Decision: ${decision.question}\n\n**Outcome:** ${resolution}\n*Decided ${dateStr} by ${requester?.name ?? "Unknown"}*`;

  const nextVersion = article.version + 1;
  await prisma.wikiArticle.update({
    where: { id: article.id },
    data: {
      content: article.content + appendBlock,
      version: { increment: 1 },
    },
  });

  await prisma.wikiArticleVersion.create({
    data: {
      articleId: article.id,
      version: nextVersion,
      title: article.title,
      content: article.content + appendBlock,
      tags: article.tags,
      message: `Decision resolved: ${decision.question.slice(0, 60)}`,
      actorId,
    },
  });
}

// ─── Withdraw Decision ──────────────────────────────────────────────

export async function withdrawDecision(
  decisionId: string,
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _actor: ActorContext
) {
  const decision = await prisma.decisionRequest.findUnique({
    where: { id: decisionId },
    include: { thread: true },
  });
  if (!decision) throw new Error("Decision not found");
  if (decision.requesterId !== userId) throw new Error("Only the requester can withdraw");

  let taskTransitioned = false;

  await prisma.$transaction(async (tx) => {
    await tx.decisionRequest.update({
      where: { id: decisionId },
      data: { status: "WITHDRAWN" },
    });

    await tx.thread.update({
      where: { id: decision.threadId },
      data: { isResolved: true, resolvedAt: new Date(), resolvedById: userId },
    });

    await tx.waitingFor.updateMany({
      where: { threadId: decision.threadId, isResolved: false },
      data: { isResolved: true, resolvedAt: new Date() },
    });

    // If task was WAITING, restore to IN_PROGRESS
    if (decision.thread.taskId) {
      const task = await tx.task.findUnique({
        where: { id: decision.thread.taskId },
        select: { status: true },
      });
      if (task?.status === "WAITING") {
        await tx.task.update({
          where: { id: decision.thread.taskId },
          data: { status: "IN_PROGRESS", version: { increment: 1 } },
        });
        taskTransitioned = true;
      }
    }
  });

  // Run cascade if task transitioned from WAITING to IN_PROGRESS
  if (taskTransitioned && decision.thread.taskId) {
    await runCascade(decision.thread.taskId, userId);
  }

  // Complete remaining respondent tasks
  completeRemainingRespondentTasks(decisionId).catch(() => {});
}

// ─── List Pending Decisions ─────────────────────────────────────────

export async function listPendingDecisions(userId: string) {
  // Find decisions where this user is a respondent
  const respondentEntries = await prisma.decisionRespondent.findMany({
    where: { userId },
    select: { decisionId: true },
  });
  const decisionIds = respondentEntries.map((r) => r.decisionId);

  // Get OPEN decisions where user has not yet responded (via either mechanism)
  const decisions = await prisma.decisionRequest.findMany({
    where: {
      id: { in: decisionIds },
      status: "OPEN",
    },
    include: {
      thread: {
        select: {
          id: true,
          taskId: true,
          projectId: true,
          task: { select: { id: true, title: true, project: { select: { team: { select: { id: true, name: true } } } } } },
          project: { select: { id: true, title: true, team: { select: { id: true, name: true } } } },
        },
      },
      requester: { select: { id: true, name: true } },
      respondents: { include: { user: { select: { id: true, name: true } } } },
      responses: { include: { user: { select: { id: true, name: true } } } },
      options: {
        orderBy: { sortOrder: "asc" },
        include: {
          votes: {
            include: { voter: { select: { id: true, name: true } } },
          },
        },
      },
      optionVotes: {
        include: { voter: { select: { id: true, name: true } } },
      },
    },
    orderBy: [{ deadline: "asc" }, { createdAt: "asc" }],
  });

  // Filter: for APPROVAL, user must not have a response; for POLL, user must not have an option vote
  return decisions.filter((d) => {
    if (d.decisionType === "POLL") {
      return !d.optionVotes.some((v) => v.voterId === userId);
    }
    return !d.responses.some((r) => r.userId === userId);
  });
}

// ─── Get Single Decision ────────────────────────────────────────────

export async function getDecision(decisionId: string) {
  return prisma.decisionRequest.findUnique({
    where: { id: decisionId },
    include: {
      ...decisionInclude,
      thread: {
        select: {
          id: true,
          taskId: true,
          projectId: true,
          task: { select: { id: true, title: true, projectId: true, project: { select: { id: true, teamId: true } } } },
          project: { select: { id: true, title: true, teamId: true } },
        },
      },
    },
  });
}

// ─── List Decisions by Project ──────────────────────────────────────

export async function listDecisionsByProject(projectId: string, userId: string) {
  // Check project team membership
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { teamId: true },
  });
  if (!project?.teamId) throw new Error("Project is not part of a team");
  if (!(await isTeamMember(userId, project.teamId))) throw new Error("Not a member of this team");

  return prisma.decisionRequest.findMany({
    where: {
      OR: [
        { thread: { projectId } },
        { thread: { task: { projectId } } },
      ],
    },
    include: decisionInclude,
    orderBy: [
      { status: "asc" }, // OPEN first (alphabetically before RESOLVED/WITHDRAWN)
      { createdAt: "desc" },
    ],
  });
}

// ─── List Decisions by Team ─────────────────────────────────────────

export async function listDecisionsByTeam(teamId: string, userId: string) {
  if (!(await isTeamMember(userId, teamId))) throw new Error("Not a member of this team");

  // Find all projects belonging to this team
  const teamProjects = await prisma.project.findMany({
    where: { teamId },
    select: { id: true },
  });
  const projectIds = teamProjects.map((p) => p.id);

  return prisma.decisionRequest.findMany({
    where: {
      OR: [
        { thread: { projectId: { in: projectIds } } },
        { thread: { task: { projectId: { in: projectIds } } } },
      ],
    },
    include: decisionInclude,
    orderBy: [
      { status: "asc" },
      { createdAt: "desc" },
    ],
  });
}

// ═══════════════════════════════════════════════════════════════════════
// DECISION PROPOSALS — Lifecycle Operations
// ═══════════════════════════════════════════════════════════════════════

// ─── Helper: resolve team from decision ─────────────────────────────

async function resolveDecisionTeam(decision: { thread: { projectId: string | null; taskId: string | null; project?: { teamId: string | null } | null; task?: { project: { teamId: string | null } | null } | null } }) {
  return decision.thread.project?.teamId ?? decision.thread.task?.project?.teamId ?? null;
}

// ─── Helper: record a decision event ────────────────────────────────

async function recordDecisionEvent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  decisionId: string,
  actorId: string,
  type: string,
  message?: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  details?: any
) {
  return tx.decisionEvent.create({
    data: { decisionId, actorId, type, message, details: details ?? undefined },
  });
}

// ─── Publish Decision (DRAFT → GATHERING_INPUT) ────────────────────

export async function publishDecision(
  decisionId: string,
  userId: string,
  input: PublishDecisionInput
) {
  const decision = await prisma.decisionRequest.findUnique({
    where: { id: decisionId },
    include: {
      thread: { select: { id: true, projectId: true, taskId: true, project: { select: { teamId: true } }, task: { select: { project: { select: { teamId: true } } } } } },
      respondents: { include: { user: { select: { id: true, name: true } } } },
    },
  });
  if (!decision) throw new Error("Decision not found");
  if (decision.requesterId !== userId) throw new Error("Only the owner can publish");
  if (decision.status !== "DRAFT") throw new Error("Only DRAFT decisions can be published");

  const teamId = await resolveDecisionTeam(decision);
  if (!teamId) throw new Error("No team context");

  const notifyUserIds: string[] = [];

  const result = await prisma.$transaction(async (tx) => {
    // Transition to GATHERING_INPUT
    await tx.decisionRequest.update({
      where: { id: decisionId },
      data: { status: "GATHERING_INPUT" },
    });

    // Create input requests and auto-generate tasks
    if (input.inputRequests && input.inputRequests.length > 0) {
      for (const ir of input.inputRequests) {
        if (!(await isTeamMember(ir.assigneeId, teamId))) continue;
        const promptText = ir.prompt || `Provide input on: ${decision.question.slice(0, 80)}`;
        const task = await tx.task.create({
          data: {
            title: promptText.slice(0, 200),
            notes: `Decision Proposal: ${decision.question}\n\nOpen the proposal to see details and submit your input.\n/decisions/${decisionId}`,
            userId: ir.assigneeId,
            energyLevel: "LOW",
            estimatedMins: ir.type === "VOTE" ? 5 : 15,
            dueDate: decision.deadline ?? undefined,
            status: "NOT_STARTED",
            isNextAction: true,
          },
        });
        await tx.decisionInputRequest.create({
          data: {
            decisionId,
            assigneeId: ir.assigneeId,
            type: ir.type ?? "OPEN_INPUT",
            prompt: ir.prompt,
            isRequired: ir.isRequired ?? true,
            taskId: task.id,
          },
        });

        // Notify assignee
        if (ir.assigneeId !== userId) {
          await tx.notification.create({
            data: {
              type: "DECISION_INPUT_NEEDED",
              title: "Your input is needed",
              body: `${decision.question.slice(0, 100)}: ${promptText.slice(0, 100)}`,
              link: `/decisions/${decisionId}`,
              userId: ir.assigneeId,
            },
          });
          notifyUserIds.push(ir.assigneeId);
        }
      }
    }

    // Generate tasks for respondents who don't have one yet
    for (const respondent of decision.respondents) {
      const existingTask = await tx.decisionRespondent.findUnique({
        where: { decisionId_userId: { decisionId, userId: respondent.userId } },
        select: { taskId: true },
      });
      if (!existingTask?.taskId) {
        const task = await tx.task.create({
          data: {
            title: `Provide input: ${decision.question.slice(0, 80)}`,
            notes: `Decision Proposal by the team. Open the proposal to see details.\n/decisions/${decisionId}`,
            userId: respondent.userId,
            energyLevel: "LOW",
            estimatedMins: 5,
            dueDate: decision.deadline ?? undefined,
            status: "NOT_STARTED",
            isNextAction: true,
          },
        });
        await tx.decisionRespondent.update({
          where: { decisionId_userId: { decisionId, userId: respondent.userId } },
          data: { taskId: task.id },
        });
      }

      // Notify all respondents about publish
      if (respondent.userId !== userId) {
        await tx.notification.create({
          data: {
            type: "DECISION_PUBLISHED",
            title: "Decision proposal published",
            body: decision.question.slice(0, 200),
            link: `/decisions/${decisionId}`,
            userId: respondent.userId,
          },
        });
        if (!notifyUserIds.includes(respondent.userId)) {
          notifyUserIds.push(respondent.userId);
        }
      }
    }

    // Create WaitingFor for owner
    await tx.waitingFor.create({
      data: {
        userId,
        description: `Proposal: ${decision.question.slice(0, 100)}`,
        person: "Team",
        dueDate: decision.deadline ?? undefined,
        threadId: decision.threadId,
      },
    });

    await recordDecisionEvent(tx, decisionId, userId, "PUBLISHED", "Proposal published for input gathering");

    return tx.decisionRequest.findUnique({
      where: { id: decisionId },
      include: decisionInclude,
    });
  });

  // Push notifications
  for (const uid of notifyUserIds) {
    canPushToUser(uid, "decisions").then((allowed) => {
      if (allowed) {
        sendPushToUser(uid, {
          title: "Decision proposal published",
          body: decision.question.slice(0, 100),
          url: `/decisions/${decisionId}`,
          tag: `decision-published-${decisionId}`,
        }).catch(() => {});
      }
    }).catch(() => {});
  }

  return result;
}

// ─── Move to Review (GATHERING_INPUT → UNDER_REVIEW) ───────────────

export async function moveToReview(decisionId: string, userId: string) {
  const decision = await prisma.decisionRequest.findUnique({
    where: { id: decisionId },
    include: { respondents: true },
  });
  if (!decision) throw new Error("Decision not found");
  if (decision.requesterId !== userId) throw new Error("Only the owner can move to review");
  if (decision.status !== "GATHERING_INPUT") throw new Error("Only GATHERING_INPUT decisions can move to review");

  const result = await prisma.$transaction(async (tx) => {
    await tx.decisionRequest.update({
      where: { id: decisionId },
      data: { status: "UNDER_REVIEW" },
    });

    // Expire any pending input requests
    await tx.decisionInputRequest.updateMany({
      where: { decisionId, status: "PENDING" },
      data: { status: "EXPIRED" },
    });

    await recordDecisionEvent(tx, decisionId, userId, "MOVED_TO_REVIEW", "Proposal moved to review phase");

    return tx.decisionRequest.findUnique({
      where: { id: decisionId },
      include: decisionInclude,
    });
  });

  return result;
}

// ─── Resolve Proposal (→ DECIDED) ──────────────────────────────────

export async function resolveProposal(
  decisionId: string,
  userId: string,
  input: ResolveProposalInput,
  actor: ActorContext
) {
  const decision = await prisma.decisionRequest.findUnique({
    where: { id: decisionId },
    include: {
      thread: { select: { id: true, projectId: true, taskId: true, project: { select: { teamId: true } }, task: { select: { project: { select: { teamId: true } } } } } },
      respondents: true,
    },
  });
  if (!decision) throw new Error("Decision not found");
  if (decision.requesterId !== userId) throw new Error("Only the owner can resolve");
  if (decision.status !== "GATHERING_INPUT" && decision.status !== "UNDER_REVIEW") {
    throw new Error("Decision must be in GATHERING_INPUT or UNDER_REVIEW to resolve");
  }

  const notifyUserIds: string[] = [];

  const result = await prisma.$transaction(async (tx) => {
    // Mark chosen option
    if (input.chosenOptionId) {
      const option = await tx.decisionOption.findFirst({ where: { id: input.chosenOptionId, decisionId } });
      if (!option) throw new Error("Option not found");
      await tx.decisionOption.updateMany({ where: { decisionId }, data: { isChosen: false } });
      await tx.decisionOption.update({ where: { id: input.chosenOptionId }, data: { isChosen: true } });
    }

    // Resolve the decision
    await tx.decisionRequest.update({
      where: { id: decisionId },
      data: {
        status: "DECIDED",
        outcome: input.outcome,
        rationale: input.rationale,
        decidedAt: new Date(),
        resolution: input.outcome, // backward compat
        resolvedAt: new Date(),
      },
    });

    // Resolve thread
    await tx.thread.update({
      where: { id: decision.threadId },
      data: { isResolved: true, resolvedAt: new Date(), resolvedById: userId },
    });

    // Resolve WaitingFor
    await tx.waitingFor.updateMany({
      where: { threadId: decision.threadId, isResolved: false },
      data: { isResolved: true, resolvedAt: new Date() },
    });

    // If task was WAITING, restore to IN_PROGRESS
    if (decision.thread.taskId) {
      const task = await tx.task.findUnique({
        where: { id: decision.thread.taskId },
        select: { status: true },
      });
      if (task?.status === "WAITING") {
        await tx.task.update({
          where: { id: decision.thread.taskId },
          data: { status: "IN_PROGRESS", version: { increment: 1 } },
        });
      }
    }

    // Notify all respondents
    for (const respondent of decision.respondents) {
      await tx.notification.create({
        data: {
          type: "DECISION_DECIDED",
          title: "Decision made",
          body: `${decision.question.slice(0, 100)}: ${input.outcome.slice(0, 100)}`,
          link: `/decisions/${decisionId}`,
          userId: respondent.userId,
        },
      });
      notifyUserIds.push(respondent.userId);
    }

    // Write event
    await recordDecisionEvent(tx, decisionId, userId, "DECIDED", `Decided: ${input.outcome.slice(0, 100)}`, { outcome: input.outcome, rationale: input.rationale });

    if (decision.thread.taskId) {
      await writeTaskEvent(tx, decision.thread.taskId, "DECISION_RESOLVED", { decisionId: { old: decisionId, new: null } }, {
        ...actor,
        message: `Proposal decided: ${decision.question.slice(0, 100)}`,
      });
    } else if (decision.thread.projectId) {
      await writeProjectEvent(tx, decision.thread.projectId, "DECISION_RESOLVED", { decisionId: { old: decisionId, new: null } }, {
        ...actor,
        message: `Proposal decided: ${decision.question.slice(0, 100)}`,
      });
    }

    return tx.decisionRequest.findUnique({
      where: { id: decisionId },
      include: decisionInclude,
    });
  });

  // Run cascade if task transitioned from WAITING to IN_PROGRESS
  if (decision.thread.taskId) {
    const taskAfter = await prisma.task.findUnique({
      where: { id: decision.thread.taskId },
      select: { status: true },
    });
    if (taskAfter?.status === "IN_PROGRESS") {
      await runCascade(decision.thread.taskId, userId);
    }
  }

  // Push notifications
  for (const uid of notifyUserIds) {
    canPushToUser(uid, "decisions").then((allowed) => {
      if (allowed) {
        sendPushToUser(uid, {
          title: "Decision made",
          body: `${decision.question.slice(0, 100)}: ${input.outcome.slice(0, 100)}`,
          url: `/decisions/${decisionId}`,
          tag: `decision-decided-${decisionId}`,
        }).catch(() => {});
      }
    }).catch(() => {});
  }

  // Complete remaining respondent tasks
  completeRemainingRespondentTasks(decisionId).catch(() => {});

  // Wiki auto-update
  if (decision.wikiSlug) {
    appendDecisionToWiki(decision.wikiSlug, decision, input.outcome, userId).catch(() => {});
  }

  return result;
}

// ─── Defer Decision ────────────────────────────────────────────────

export async function deferDecision(decisionId: string, userId: string, reason?: string) {
  const decision = await prisma.decisionRequest.findUnique({
    where: { id: decisionId },
    include: { respondents: true },
  });
  if (!decision) throw new Error("Decision not found");
  if (decision.requesterId !== userId) throw new Error("Only the owner can defer");
  if (decision.status !== "DRAFT" && decision.status !== "GATHERING_INPUT" && decision.status !== "UNDER_REVIEW") {
    throw new Error("Decision cannot be deferred from current state");
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.decisionRequest.update({
      where: { id: decisionId },
      data: { status: "DEFERRED" },
    });

    await tx.waitingFor.updateMany({
      where: { threadId: decision.threadId, isResolved: false },
      data: { isResolved: true, resolvedAt: new Date() },
    });

    // Notify contributors
    for (const respondent of decision.respondents) {
      if (respondent.userId !== userId) {
        await tx.notification.create({
          data: {
            type: "DECISION_DEFERRED",
            title: "Decision deferred",
            body: `${decision.question.slice(0, 100)}${reason ? `: ${reason.slice(0, 100)}` : ""}`,
            link: `/decisions/${decisionId}`,
            userId: respondent.userId,
          },
        });
      }
    }

    await recordDecisionEvent(tx, decisionId, userId, "DEFERRED_EVENT", reason ?? "Decision deferred");

    return tx.decisionRequest.findUnique({
      where: { id: decisionId },
      include: decisionInclude,
    });
  });

  completeRemainingRespondentTasks(decisionId).catch(() => {});
  return result;
}

// ─── Cancel Decision ───────────────────────────────────────────────

export async function cancelDecision(decisionId: string, userId: string, reason?: string) {
  const decision = await prisma.decisionRequest.findUnique({
    where: { id: decisionId },
    include: { respondents: true },
  });
  if (!decision) throw new Error("Decision not found");
  if (decision.requesterId !== userId) throw new Error("Only the owner can cancel");
  if (decision.status === "DECIDED" || decision.status === "CANCELED") {
    throw new Error("Decision cannot be canceled from current state");
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.decisionRequest.update({
      where: { id: decisionId },
      data: { status: "CANCELED" },
    });

    await tx.thread.update({
      where: { id: decision.threadId },
      data: { isResolved: true, resolvedAt: new Date(), resolvedById: userId },
    });

    await tx.waitingFor.updateMany({
      where: { threadId: decision.threadId, isResolved: false },
      data: { isResolved: true, resolvedAt: new Date() },
    });

    // Notify contributors
    for (const respondent of decision.respondents) {
      if (respondent.userId !== userId) {
        await tx.notification.create({
          data: {
            type: "DECISION_CANCELED",
            title: "Decision canceled",
            body: `${decision.question.slice(0, 100)}${reason ? `: ${reason.slice(0, 100)}` : ""}`,
            link: `/decisions/${decisionId}`,
            userId: respondent.userId,
          },
        });
      }
    }

    await recordDecisionEvent(tx, decisionId, userId, "CANCELED_EVENT", reason ?? "Decision canceled");

    return tx.decisionRequest.findUnique({
      where: { id: decisionId },
      include: decisionInclude,
    });
  });

  completeRemainingRespondentTasks(decisionId).catch(() => {});
  return result;
}

// ─── Create Input Request ──────────────────────────────────────────

export async function createInputRequest(
  decisionId: string,
  userId: string,
  input: CreateInputRequestInput
) {
  const decision = await prisma.decisionRequest.findUnique({
    where: { id: decisionId },
    include: { thread: { select: { projectId: true, taskId: true, project: { select: { teamId: true } }, task: { select: { project: { select: { teamId: true } } } } } } },
  });
  if (!decision) throw new Error("Decision not found");
  if (decision.requesterId !== userId) throw new Error("Only the owner can add input requests");
  if (decision.status !== "DRAFT" && decision.status !== "GATHERING_INPUT") {
    throw new Error("Input requests can only be added in DRAFT or GATHERING_INPUT state");
  }

  const teamId = await resolveDecisionTeam(decision);
  if (!teamId || !(await isTeamMember(input.assigneeId, teamId))) {
    throw new Error("Assignee is not a team member");
  }

  const promptText = input.prompt || `Provide input on: ${decision.question.slice(0, 80)}`;

  const result = await prisma.$transaction(async (tx) => {
    // Only create task if decision is published (GATHERING_INPUT)
    let taskId: string | undefined;
    if (decision.status === "GATHERING_INPUT") {
      const task = await tx.task.create({
        data: {
          title: promptText.slice(0, 200),
          notes: `Decision Proposal: ${decision.question}\n/decisions/${decisionId}`,
          userId: input.assigneeId,
          energyLevel: "LOW",
          estimatedMins: input.type === "VOTE" ? 5 : 15,
          dueDate: decision.deadline ?? undefined,
          status: "NOT_STARTED",
          isNextAction: true,
        },
      });
      taskId = task.id;

      // Notify assignee
      if (input.assigneeId !== userId) {
        await tx.notification.create({
          data: {
            type: "DECISION_INPUT_NEEDED",
            title: "Your input is needed",
            body: `${decision.question.slice(0, 100)}: ${promptText.slice(0, 100)}`,
            link: `/decisions/${decisionId}`,
            userId: input.assigneeId,
          },
        });
      }
    }

    const ir = await tx.decisionInputRequest.create({
      data: {
        decisionId,
        assigneeId: input.assigneeId,
        type: input.type ?? "OPEN_INPUT",
        prompt: input.prompt,
        isRequired: input.isRequired ?? true,
        taskId,
      },
      include: {
        assignee: { select: { id: true, name: true } },
        task: { select: { id: true, status: true } },
      },
    });

    await recordDecisionEvent(tx, decisionId, userId, "INPUT_REQUESTED", `Input requested from ${ir.assignee.name}: ${promptText.slice(0, 80)}`);

    return ir;
  });

  // Push notification
  if (decision.status === "GATHERING_INPUT" && input.assigneeId !== userId) {
    canPushToUser(input.assigneeId, "decisions").then((allowed) => {
      if (allowed) {
        sendPushToUser(input.assigneeId, {
          title: "Your input is needed",
          body: `${decision.question.slice(0, 100)}`,
          url: `/decisions/${decisionId}`,
          tag: `decision-input-${decisionId}`,
        }).catch(() => {});
      }
    }).catch(() => {});
  }

  return result;
}

// ─── Update Input Request ──────────────────────────────────────────

export async function updateInputRequest(
  inputRequestId: string,
  userId: string,
  input: UpdateInputRequestInput
) {
  const ir = await prisma.decisionInputRequest.findUnique({
    where: { id: inputRequestId },
    include: { decision: { select: { requesterId: true } } },
  });
  if (!ir) throw new Error("Input request not found");
  if (ir.decision.requesterId !== userId) throw new Error("Only the decision owner can update input requests");

  return prisma.decisionInputRequest.update({
    where: { id: inputRequestId },
    data: {
      status: input.status,
      prompt: input.prompt,
      respondedAt: input.status === "SUBMITTED" ? new Date() : undefined,
    },
    include: {
      assignee: { select: { id: true, name: true } },
      task: { select: { id: true, status: true } },
    },
  });
}

// ─── Submit Contribution (extended for proposals) ───────────────────

export async function submitProposalContribution(
  decisionId: string,
  userId: string,
  content: string,
  inputRequestId?: string
) {
  const decision = await prisma.decisionRequest.findUnique({
    where: { id: decisionId },
    include: {
      thread: { select: { projectId: true, taskId: true, project: { select: { teamId: true } }, task: { select: { project: { select: { teamId: true } } } } } },
      inputRequests: { where: { status: "PENDING" } },
    },
  });
  if (!decision) throw new Error("Decision not found");
  if (decision.status !== "GATHERING_INPUT" && decision.status !== "OPEN") {
    throw new Error("Decision is not accepting contributions");
  }

  const teamId = await resolveDecisionTeam(decision);
  if (!teamId || !(await isTeamMember(userId, teamId))) {
    throw new Error("Not a member of this team");
  }

  const result = await prisma.$transaction(async (tx) => {
    const contribution = await tx.decisionContribution.create({
      data: { decisionId, authorId: userId, content },
      include: { author: { select: { id: true, name: true } } },
    });

    // Mark input request as submitted if provided
    if (inputRequestId) {
      await tx.decisionInputRequest.update({
        where: { id: inputRequestId },
        data: { status: "SUBMITTED", respondedAt: new Date() },
      });
      // Auto-complete the linked task
      const ir = await tx.decisionInputRequest.findUnique({
        where: { id: inputRequestId },
        select: { taskId: true },
      });
      if (ir?.taskId) {
        await tx.task.updateMany({
          where: { id: ir.taskId, status: { not: "COMPLETED" } },
          data: { status: "COMPLETED", completedAt: new Date() },
        });
      }
    }

    // Auto-complete respondent task
    await autoCompleteRespondentTask(decisionId, userId);

    // Record event
    await recordDecisionEvent(tx, decisionId, userId, "CONTRIBUTION_ADDED", `Contribution added by ${contribution.author.name}`);

    // Notify decision owner
    if (decision.requesterId !== userId) {
      await tx.notification.create({
        data: {
          type: "DECISION_INPUT_RECEIVED",
          title: "Input received",
          body: `${contribution.author.name} submitted input on: ${decision.question.slice(0, 100)}`,
          link: `/decisions/${decisionId}`,
          userId: decision.requesterId,
        },
      });
    }

    // Check if all required inputs are complete
    const pendingRequired = await tx.decisionInputRequest.count({
      where: { decisionId, isRequired: true, status: "PENDING" },
    });
    if (pendingRequired === 0 && decision.inputRequests.length > 0) {
      await tx.notification.create({
        data: {
          type: "DECISION_ALL_INPUTS_COMPLETE",
          title: "All required inputs received",
          body: `All required inputs for "${decision.question.slice(0, 100)}" have been submitted`,
          link: `/decisions/${decisionId}`,
          userId: decision.requesterId,
        },
      });
    }

    return contribution;
  });

  // Push to owner
  if (decision.requesterId !== userId) {
    canPushToUser(decision.requesterId, "decisions").then((allowed) => {
      if (allowed) {
        sendPushToUser(decision.requesterId, {
          title: "Input received",
          body: `New input on: ${decision.question.slice(0, 80)}`,
          url: `/decisions/${decisionId}`,
          tag: `decision-contribution-${decisionId}`,
        }).catch(() => {});
      }
    }).catch(() => {});
  }

  return result;
}

// ─── List Decision Events ──────────────────────────────────────────

export async function listDecisionEvents(decisionId: string) {
  return prisma.decisionEvent.findMany({
    where: { decisionId },
    include: { actor: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
}
