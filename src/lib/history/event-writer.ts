import { PrismaClient, Prisma, TaskEventType, ProjectEventType, InboxEventType, TeamEventType, ActorType, EventSource } from "@prisma/client";
import { diff, createdDiff, ChangeDiff } from "./diff";

interface EventContext {
  actorType: ActorType;
  actorId?: string | null;
  source?: EventSource;
  triggeredBy?: string;
  message?: string;
}

/**
 * Write a TaskEvent within an existing transaction.
 * Call this after applying the mutation but within the same $transaction.
 */
export async function writeTaskEvent(
  tx: PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
  taskId: string,
  eventType: TaskEventType,
  changes: ChangeDiff,
  ctx: EventContext
) {
  if (Object.keys(changes).length === 0) return null;

  return (tx as PrismaClient).taskEvent.create({
    data: {
      taskId,
      eventType,
      actorType: ctx.actorType,
      actorId: ctx.actorId ?? null,
      changes: changes as Prisma.InputJsonValue,
      message: ctx.message,
      source: ctx.source ?? "MANUAL",
      triggeredBy: ctx.triggeredBy,
    },
  });
}

/**
 * Write a ProjectEvent within an existing transaction.
 */
export async function writeProjectEvent(
  tx: PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
  projectId: string,
  eventType: ProjectEventType,
  changes: ChangeDiff,
  ctx: EventContext
) {
  if (Object.keys(changes).length === 0) return null;

  return (tx as PrismaClient).projectEvent.create({
    data: {
      projectId,
      eventType,
      actorType: ctx.actorType,
      actorId: ctx.actorId ?? null,
      changes: changes as Prisma.InputJsonValue,
      message: ctx.message,
      source: ctx.source ?? "MANUAL",
      triggeredBy: ctx.triggeredBy,
    },
  });
}

/**
 * Write an InboxEvent within an existing transaction.
 */
export async function writeInboxEvent(
  tx: PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
  inboxItemId: string,
  eventType: InboxEventType,
  changes: ChangeDiff,
  ctx: EventContext
) {
  if (Object.keys(changes).length === 0) return null;

  return (tx as PrismaClient).inboxEvent.create({
    data: {
      inboxItemId,
      eventType,
      actorType: ctx.actorType,
      actorId: ctx.actorId ?? null,
      changes: changes as Prisma.InputJsonValue,
      message: ctx.message,
      source: ctx.source ?? "MANUAL",
    },
  });
}

/**
 * Write a TeamEvent within an existing transaction.
 */
export async function writeTeamEvent(
  tx: PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
  teamId: string,
  eventType: TeamEventType,
  changes: ChangeDiff,
  ctx: EventContext
) {
  if (Object.keys(changes).length === 0) return null;

  return (tx as PrismaClient).teamEvent.create({
    data: {
      teamId,
      eventType,
      actorType: ctx.actorType,
      actorId: ctx.actorId ?? null,
      changes: changes as Prisma.InputJsonValue,
      message: ctx.message,
      source: ctx.source ?? "MANUAL",
      triggeredBy: ctx.triggeredBy,
    },
  });
}

/**
 * Infer the most specific TaskEventType from the changes.
 */
export function inferTaskEventType(
  changes: ChangeDiff,
  isNew: boolean
): TaskEventType {
  if (isNew) return "CREATED";

  if ("status" in changes) {
    const newStatus = changes.status.new;
    if (newStatus === "COMPLETED") return "COMPLETED";
    if (changes.status.old === "COMPLETED") return "REOPENED";
    return "STATUS_CHANGED";
  }
  if ("contextId" in changes || "context" in changes) return "CONTEXT_CHANGED";
  if ("projectId" in changes) {
    return changes.projectId.new ? "MOVED_TO_PROJECT" : "REMOVED_FROM_PROJECT";
  }
  if ("assignedToId" in changes) return "DELEGATED";
  if ("scheduledDate" in changes) {
    return changes.scheduledDate.new ? "DEFERRED" : "ACTIVATED";
  }
  if ("isNextAction" in changes && changes.isNextAction.new === true) {
    return "PROMOTED";
  }

  return "UPDATED";
}

export { diff, createdDiff };
