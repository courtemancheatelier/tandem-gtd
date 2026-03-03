import { InboxItem, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createdDiff, diff } from "@/lib/history/diff";
import { writeInboxEvent } from "@/lib/history/event-writer";
import { CreateInboxItemInput } from "@/lib/validations/inbox";
import type { ActorContext } from "./task-service";

// Transaction client type for Prisma interactive transactions
type TxClient = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/**
 * Create an inbox item with event history tracking.
 * Creates the item in a transaction and writes a CAPTURED event.
 */
export async function createInboxItem(
  userId: string,
  data: CreateInboxItemInput,
  actor: ActorContext
): Promise<InboxItem> {
  const item = await prisma.$transaction(async (tx: TxClient) => {
    const created = await tx.inboxItem.create({
      data: {
        ...data,
        userId,
        aiVisibility: "VISIBLE",
      },
    });

    // Write CAPTURED event
    const changes = createdDiff(created as unknown as Record<string, unknown>);
    await writeInboxEvent(tx, created.id, "CAPTURED", changes, actor);

    return created;
  });

  return item;
}

/**
 * Mark an inbox item as processed with event history tracking.
 * Updates the status in a transaction and writes a PROCESSED event.
 */
export async function processInboxItem(
  inboxItemId: string,
  userId: string,
  actor: ActorContext
): Promise<InboxItem> {
  const existing = await prisma.inboxItem.findFirst({
    where: { id: inboxItemId, userId },
  });
  if (!existing) throw new Error("Inbox item not found");

  const item = await prisma.$transaction(async (tx: TxClient) => {
    const updated = await tx.inboxItem.update({
      where: { id: inboxItemId },
      data: { status: "PROCESSED" },
    });

    // Write PROCESSED event
    const changes = diff(
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>
    );
    await writeInboxEvent(tx, inboxItemId, "PROCESSED", changes, actor);

    return updated;
  });

  return item;
}
