import { prisma } from "@/lib/prisma";
import { ChildType, ProjectStatus, PrismaClient } from "@prisma/client";
import { writeProjectEvent } from "@/lib/history/event-writer";

type TxClient = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

interface ActorContext {
  actorType: "USER" | "SYSTEM" | "AI";
  actorId?: string | null;
  source?: "MANUAL" | "MCP" | "AI_EMBED" | "CASCADE" | "SCHEDULER" | "API" | "IMPORT";
  triggeredBy?: string;
}

/**
 * Determine what status a new child project should receive based on the parent's childType.
 */
export async function computeChildInitialStatus(
  parentId: string,
  parentChildType: ChildType
): Promise<ProjectStatus> {
  if (parentChildType !== ChildType.SEQUENTIAL) {
    return ProjectStatus.ACTIVE;
  }

  const existingChildren = await prisma.project.count({
    where: {
      parentProjectId: parentId,
      status: { in: [ProjectStatus.ACTIVE, ProjectStatus.ON_HOLD] },
    },
  });

  return existingChildren === 0 ? ProjectStatus.ACTIVE : ProjectStatus.ON_HOLD;
}

/**
 * Assign the next sequential sort position for a new child.
 */
export async function computeChildSortOrder(parentId: string): Promise<number> {
  const maxChild = await prisma.project.findFirst({
    where: { parentProjectId: parentId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  return (maxChild?.sortOrder ?? -1) + 1;
}

/**
 * Promote the next ON_HOLD child project when one completes or is dropped.
 */
export async function promoteNextChild(
  completedChildId: string,
  parentId: string,
  userId: string,
  actor: ActorContext,
  tx?: TxClient
): Promise<{ id: string; title: string } | null> {
  const db = (tx ?? prisma) as PrismaClient;

  const parent = await db.project.findUnique({
    where: { id: parentId },
    select: { childType: true },
  });

  if (parent?.childType !== ChildType.SEQUENTIAL) return null;

  const nextChild = await db.project.findFirst({
    where: {
      parentProjectId: parentId,
      status: ProjectStatus.ON_HOLD,
      id: { not: completedChildId },
    },
    orderBy: { sortOrder: "asc" },
  });

  if (!nextChild) return null;

  await db.project.update({
    where: { id: nextChild.id },
    data: { status: ProjectStatus.ACTIVE, version: { increment: 1 } },
  });

  await writeProjectEvent(db, nextChild.id, "REACTIVATED", {
    status: { old: "ON_HOLD", new: "ACTIVE" },
  }, {
    actorType: actor.actorType as "USER" | "SYSTEM" | "AI",
    actorId: actor.actorId,
    source: "CASCADE",
    triggeredBy: completedChildId,
    message: "Sequential child promotion",
  });

  await writeProjectEvent(db, parentId, "CHILD_ACTIVATED", {
    childId: { old: null, new: nextChild.id },
    childTitle: { old: null, new: nextChild.title },
  }, {
    actorType: actor.actorType as "USER" | "SYSTEM" | "AI",
    actorId: actor.actorId,
    source: "CASCADE",
    triggeredBy: completedChildId,
  });

  return { id: nextChild.id, title: nextChild.title };
}

/**
 * Adjust child statuses when the parent's childType changes.
 */
export async function reconcileChildrenOnChildTypeChange(
  parentId: string,
  oldChildType: ChildType,
  newChildType: ChildType
): Promise<void> {
  if (oldChildType === newChildType) return;

  if (newChildType === ChildType.SEQUENTIAL) {
    // PARALLEL → SEQUENTIAL: keep first active child, put rest ON_HOLD
    const activeChildren = await prisma.project.findMany({
      where: {
        parentProjectId: parentId,
        status: ProjectStatus.ACTIVE,
      },
      orderBy: { sortOrder: "asc" },
    });

    for (const child of activeChildren.slice(1)) {
      await prisma.project.update({
        where: { id: child.id },
        data: { status: ProjectStatus.ON_HOLD, version: { increment: 1 } },
      });
    }
  } else {
    // SEQUENTIAL → PARALLEL: activate all ON_HOLD children
    await prisma.project.updateMany({
      where: {
        parentProjectId: parentId,
        status: ProjectStatus.ON_HOLD,
      },
      data: { status: ProjectStatus.ACTIVE, version: { increment: 1 } },
    });
  }
}

/**
 * Bulk-reorder sibling sub-projects.
 */
export async function reorderChildren(
  parentId: string,
  childIds: string[],
  userId: string,
  actor: ActorContext
): Promise<void> {
  await prisma.$transaction(async (tx: TxClient) => {
    const children = await (tx as PrismaClient).project.findMany({
      where: { parentProjectId: parentId },
      select: { id: true },
    });

    const childIdSet = new Set(children.map((c) => c.id));
    for (const id of childIds) {
      if (!childIdSet.has(id)) {
        throw new Error(`Project ${id} is not a child of ${parentId}`);
      }
    }

    for (let i = 0; i < childIds.length; i++) {
      await (tx as PrismaClient).project.update({
        where: { id: childIds[i] },
        data: { sortOrder: i, version: { increment: 1 } },
      });
    }

    await writeProjectEvent(tx, parentId, "CHILDREN_REORDERED", {
      childIds: { old: null, new: childIds },
    }, {
      actorType: actor.actorType as "USER" | "SYSTEM" | "AI",
      actorId: actor.actorId,
      source: actor.source as "MANUAL" | "MCP" | "AI_EMBED" | "CASCADE" | "SCHEDULER" | "API" | "IMPORT" | undefined,
    });

    await reconcileSequentialChildren(parentId, userId, actor, tx);
  });
}

/**
 * Ensure exactly one child is ACTIVE in a sequentially-ordered parent.
 */
export async function reconcileSequentialChildren(
  parentId: string,
  userId: string,
  actor: ActorContext,
  tx?: TxClient
): Promise<void> {
  const db = (tx ?? prisma) as PrismaClient;

  const parent = await db.project.findUnique({
    where: { id: parentId },
    select: { childType: true },
  });

  if (parent?.childType !== ChildType.SEQUENTIAL) return;

  const children = await db.project.findMany({
    where: {
      parentProjectId: parentId,
      status: { in: [ProjectStatus.ACTIVE, ProjectStatus.ON_HOLD] },
    },
    orderBy: { sortOrder: "asc" },
  });

  if (children.length === 0) return;

  for (let i = 0; i < children.length; i++) {
    const targetStatus = i === 0 ? ProjectStatus.ACTIVE : ProjectStatus.ON_HOLD;
    if (children[i].status !== targetStatus) {
      await db.project.update({
        where: { id: children[i].id },
        data: { status: targetStatus, version: { increment: 1 } },
      });
    }
  }
}
