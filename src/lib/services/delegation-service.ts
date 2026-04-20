import { prisma } from "@/lib/prisma";
import { DelegationStatus, PrismaClient } from "@prisma/client";
import { writeTaskEvent } from "@/lib/history/event-writer";
import { sendPushToUser } from "@/lib/push";

type TxClient = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/**
 * Create a delegation: sends a task to another user, auto-creates WaitingFor,
 * and notifies the recipient.
 */
export async function createDelegation(
  taskId: string,
  delegatorId: string,
  delegateeId: string,
  landingZone: "INBOX" | "DO_NOW",
  note?: string
) {
  if (delegatorId === delegateeId) {
    throw new Error("Cannot delegate a task to yourself");
  }

  // Verify the task belongs to the delegator
  const task = await prisma.task.findFirst({
    where: { id: taskId, userId: delegatorId },
  });
  if (!task) throw new Error("Task not found or not owned by you");

  // Check task isn't already delegated
  const existingDelegation = await prisma.delegation.findUnique({
    where: { taskId },
  });
  if (existingDelegation) {
    throw new Error("Task is already delegated");
  }

  // Verify delegatee exists and shares at least one team with delegator
  const sharedTeam = await prisma.teamMember.findFirst({
    where: {
      userId: delegateeId,
      team: {
        members: {
          some: { userId: delegatorId },
        },
      },
    },
  });
  if (!sharedTeam) {
    throw new Error("Delegatee must share at least one team with you");
  }

  const delegatee = await prisma.user.findUnique({
    where: { id: delegateeId },
    select: { id: true, name: true },
  });
  if (!delegatee) throw new Error("Delegatee not found");

  const delegator = await prisma.user.findUnique({
    where: { id: delegatorId },
    select: { id: true, name: true },
  });

  const result = await prisma.$transaction(async (tx: TxClient) => {
    // 1. Create WaitingFor for the delegator
    const waitingFor = await tx.waitingFor.create({
      data: {
        description: `Delegated: ${task.title}`,
        person: delegatee.name,
        userId: delegatorId,
        delegatedUserId: delegateeId,
      },
    });

    // 2. Create the Delegation record
    const delegation = await tx.delegation.create({
      data: {
        taskId,
        delegatorId,
        delegateeId,
        landingZone,
        note,
        waitingForId: waitingFor.id,
      },
      include: {
        delegator: { select: { id: true, name: true } },
        delegatee: { select: { id: true, name: true } },
        task: { select: { id: true, title: true } },
      },
    });

    // 3. Remove the task from the delegator's active lists
    await tx.task.update({
      where: { id: taskId },
      data: {
        isNextAction: false,
        assignedToId: delegateeId,
        version: { increment: 1 },
      },
    });

    // 4. Create notification for the recipient
    const notification = await tx.notification.create({
      data: {
        type: "DELEGATION_RECEIVED",
        title: `${delegator?.name} delegated a task to you`,
        body: task.title + (note ? `\n\n"${note}"` : ""),
        link: `/inbox`,
        userId: delegateeId,
        taskId,
      },
    });

    // 5. Write task event
    await writeTaskEvent(
      tx,
      taskId,
      "DELEGATED",
      {
        assignedToId: { old: task.assignedToId, new: delegateeId },
      },
      {
        actorType: "USER",
        actorId: delegatorId,
        source: "MANUAL",
        message: `Delegated to ${delegatee.name}`,
      }
    );

    return { delegation, waitingFor, notification };
  });

  // Send push notification (non-blocking)
  sendPushToUser(delegateeId, {
    title: `${delegator?.name} delegated a task to you`,
    body: task.title,
    url: "/inbox",
    tag: `delegation-${result.delegation.id}`,
  }).catch(() => {});

  return result;
}

/**
 * Accept a delegation: transfers task ownership to the delegatee,
 * creates inbox item or sets isNextAction based on landing zone.
 */
export async function acceptDelegation(delegationId: string, userId: string) {
  const delegation = await prisma.delegation.findUnique({
    where: { id: delegationId },
    include: {
      task: true,
      delegator: { select: { id: true, name: true } },
    },
  });

  if (!delegation) throw new Error("Delegation not found");
  if (delegation.delegateeId !== userId) {
    throw new Error("Only the delegatee can accept this delegation");
  }
  if (delegation.status !== "PENDING" && delegation.status !== "VIEWED") {
    throw new Error(`Cannot accept delegation with status ${delegation.status}`);
  }

  const result = await prisma.$transaction(async (tx: TxClient) => {
    // 1. Update delegation status
    const updated = await tx.delegation.update({
      where: { id: delegationId },
      data: {
        status: "ACCEPTED",
        respondedAt: new Date(),
      },
      include: {
        task: { select: { id: true, title: true } },
        delegator: { select: { id: true, name: true } },
        delegatee: { select: { id: true, name: true } },
      },
    });

    // 2. Transfer task ownership to delegatee
    const taskUpdate: Record<string, unknown> = {
      userId,
      version: { increment: 1 },
    };

    if (delegation.landingZone === "DO_NOW") {
      taskUpdate.isNextAction = true;
    }

    await tx.task.update({
      where: { id: delegation.taskId },
      data: taskUpdate,
    });

    // 3. If INBOX landing, create an InboxItem for the recipient
    if (delegation.landingZone === "INBOX") {
      await tx.inboxItem.create({
        data: {
          content: delegation.task.title,
          notes: delegation.note || undefined,
          userId,
        },
      });
    }

    // 4. Notify delegator
    await tx.notification.create({
      data: {
        type: "DELEGATION_ACCEPTED",
        title: `${updated.delegatee.name} accepted your delegated task`,
        body: delegation.task.title,
        link: `/waiting-for`,
        userId: delegation.delegatorId,
        taskId: delegation.taskId,
      },
    });

    // 5. Write task event
    await writeTaskEvent(
      tx,
      delegation.taskId,
      "DELEGATION_ACCEPTED",
      {
        userId: { old: delegation.delegatorId, new: userId },
      },
      {
        actorType: "USER",
        actorId: userId,
        source: "MANUAL",
        message: `Accepted delegation from ${delegation.delegator.name}`,
      }
    );

    return updated;
  });

  // Push notification to delegator
  sendPushToUser(delegation.delegatorId, {
    title: "Delegation accepted",
    body: `${delegation.task.title} was accepted`,
    url: "/waiting-for",
    tag: `delegation-${delegationId}`,
  }).catch(() => {});

  return result;
}

/**
 * Decline a delegation: returns the task to the delegator's inbox,
 * closes the WaitingFor.
 */
export async function declineDelegation(
  delegationId: string,
  userId: string,
  reason?: string
) {
  const delegation = await prisma.delegation.findUnique({
    where: { id: delegationId },
    include: {
      task: true,
      delegatee: { select: { id: true, name: true } },
      delegator: { select: { id: true, name: true } },
    },
  });

  if (!delegation) throw new Error("Delegation not found");
  if (delegation.delegateeId !== userId) {
    throw new Error("Only the delegatee can decline this delegation");
  }
  if (
    delegation.status !== "PENDING" &&
    delegation.status !== "VIEWED" &&
    delegation.status !== "ACCEPTED"
  ) {
    throw new Error(`Cannot decline delegation with status ${delegation.status}`);
  }

  const result = await prisma.$transaction(async (tx: TxClient) => {
    // 1. Update delegation status
    const updated = await tx.delegation.update({
      where: { id: delegationId },
      data: {
        status: "DECLINED",
        respondedAt: new Date(),
        declineReason: reason,
      },
      include: {
        task: { select: { id: true, title: true } },
        delegator: { select: { id: true, name: true } },
        delegatee: { select: { id: true, name: true } },
      },
    });

    // 2. Return task to delegator
    await tx.task.update({
      where: { id: delegation.taskId },
      data: {
        userId: delegation.delegatorId,
        assignedToId: null,
        isNextAction: false,
        version: { increment: 1 },
      },
    });

    // 3. Create inbox item for delegator to re-process the task
    await tx.inboxItem.create({
      data: {
        content: `[Declined] ${delegation.task.title}`,
        notes: reason
          ? `Declined by ${delegation.delegatee.name}: ${reason}`
          : `Declined by ${delegation.delegatee.name}`,
        userId: delegation.delegatorId,
      },
    });

    // 4. Close the WaitingFor
    if (delegation.waitingForId) {
      await tx.waitingFor.update({
        where: { id: delegation.waitingForId },
        data: {
          isResolved: true,
          resolvedAt: new Date(),
        },
      });
    }

    // 5. Notify delegator
    await tx.notification.create({
      data: {
        type: "DELEGATION_DECLINED",
        title: `${delegation.delegatee.name} declined your delegated task`,
        body:
          delegation.task.title +
          (reason ? `\n\nReason: ${reason}` : ""),
        link: `/inbox`,
        userId: delegation.delegatorId,
        taskId: delegation.taskId,
      },
    });

    // 6. Write task event
    await writeTaskEvent(
      tx,
      delegation.taskId,
      "DELEGATION_DECLINED",
      {
        assignedToId: { old: delegation.delegateeId, new: null },
        userId: { old: delegation.delegateeId, new: delegation.delegatorId },
      },
      {
        actorType: "USER",
        actorId: userId,
        source: "MANUAL",
        message: reason
          ? `Declined: ${reason}`
          : `Declined delegation`,
      }
    );

    return updated;
  });

  // Push notification to delegator
  sendPushToUser(delegation.delegatorId, {
    title: "Delegation declined",
    body: `${delegation.delegatee.name} declined: ${delegation.task.title}`,
    url: "/inbox",
    tag: `delegation-${delegationId}`,
  }).catch(() => {});

  return result;
}

/**
 * Recall a delegation: only if PENDING or VIEWED. Returns the task
 * to the delegator and closes the WaitingFor.
 */
export async function recallDelegation(delegationId: string, userId: string) {
  const delegation = await prisma.delegation.findUnique({
    where: { id: delegationId },
    include: {
      task: true,
      delegatee: { select: { id: true, name: true } },
    },
  });

  if (!delegation) throw new Error("Delegation not found");
  if (delegation.delegatorId !== userId) {
    throw new Error("Only the delegator can recall this delegation");
  }
  if (delegation.status !== "PENDING" && delegation.status !== "VIEWED") {
    throw new Error("Can only recall PENDING or VIEWED delegations");
  }

  const result = await prisma.$transaction(async (tx: TxClient) => {
    // 1. Update delegation status
    const updated = await tx.delegation.update({
      where: { id: delegationId },
      data: { status: "RECALLED" },
      include: {
        task: { select: { id: true, title: true } },
        delegator: { select: { id: true, name: true } },
        delegatee: { select: { id: true, name: true } },
      },
    });

    // 2. Return task to delegator
    await tx.task.update({
      where: { id: delegation.taskId },
      data: {
        assignedToId: null,
        version: { increment: 1 },
      },
    });

    // 3. Close the WaitingFor
    if (delegation.waitingForId) {
      await tx.waitingFor.update({
        where: { id: delegation.waitingForId },
        data: {
          isResolved: true,
          resolvedAt: new Date(),
        },
      });
    }

    // 4. Notify the delegatee
    await tx.notification.create({
      data: {
        type: "DELEGATION_RECALLED",
        title: `${updated.delegator.name} recalled a delegated task`,
        body: delegation.task.title,
        link: "/do-now",
        userId: delegation.delegateeId,
        taskId: delegation.taskId,
      },
    });

    return updated;
  });

  // Push notification to delegatee
  sendPushToUser(delegation.delegateeId, {
    title: "Delegation recalled",
    body: delegation.task.title,
    url: "/do-now",
    tag: `delegation-${delegationId}`,
  }).catch(() => {});

  return result;
}

/**
 * Complete a delegation: triggered when a delegated task is completed.
 * Auto-resolves WaitingFor and notifies the delegator.
 */
export async function completeDelegation(taskId: string) {
  const delegation = await prisma.delegation.findUnique({
    where: { taskId },
    include: {
      task: { select: { id: true, title: true } },
      delegatee: { select: { id: true, name: true } },
      delegator: { select: { id: true, name: true } },
    },
  });

  if (!delegation) return null;
  if (delegation.status !== "ACCEPTED") return null;

  const result = await prisma.$transaction(async (tx: TxClient) => {
    // 1. Update delegation status
    const updated = await tx.delegation.update({
      where: { id: delegation.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });

    // 2. Auto-resolve WaitingFor
    if (delegation.waitingForId) {
      await tx.waitingFor.update({
        where: { id: delegation.waitingForId },
        data: {
          isResolved: true,
          resolvedAt: new Date(),
        },
      });
    }

    // 3. Notify delegator
    await tx.notification.create({
      data: {
        type: "DELEGATION_COMPLETED",
        title: `${delegation.delegatee.name} completed your delegated task`,
        body: delegation.task.title,
        link: `/waiting-for`,
        userId: delegation.delegatorId,
        taskId: delegation.taskId,
      },
    });

    return updated;
  });

  // Push notification to delegator
  sendPushToUser(delegation.delegatorId, {
    title: "Delegated task completed",
    body: `${delegation.delegatee.name} completed: ${delegation.task.title}`,
    url: "/waiting-for",
    tag: `delegation-${delegation.id}`,
  }).catch(() => {});

  return result;
}

/**
 * Mark a delegation as VIEWED when the delegatee first sees it.
 */
export async function markDelegationViewed(delegationId: string, userId: string) {
  const delegation = await prisma.delegation.findUnique({
    where: { id: delegationId },
  });

  if (!delegation) return null;
  if (delegation.delegateeId !== userId) return null;
  if (delegation.status !== "PENDING") return null;

  return prisma.delegation.update({
    where: { id: delegationId },
    data: {
      status: "VIEWED",
      viewedAt: new Date(),
    },
  });
}

/**
 * Check if a task has an active delegation (for cascade guard).
 */
export async function hasActiveDelegation(taskId: string): Promise<boolean> {
  const delegation = await prisma.delegation.findUnique({
    where: { taskId },
  });
  if (!delegation) return false;
  const activeStatuses: DelegationStatus[] = [
    DelegationStatus.PENDING,
    DelegationStatus.VIEWED,
    DelegationStatus.ACCEPTED,
  ];
  return activeStatuses.includes(delegation.status);
}
