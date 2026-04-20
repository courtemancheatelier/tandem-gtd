/**
 * Backfill script for Commitment Drift counters.
 * Replays all TaskEvent records to populate deferralCount, dueDatePushCount,
 * originalDueDate, and totalDriftDays on existing tasks.
 *
 * Run with: npx tsx prisma/backfill-drift.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface ChangeDiff {
  [field: string]: { old: unknown; new: unknown };
}

function isForwardShift(change: { old: unknown; new: unknown }): boolean {
  if (!change.old || !change.new) return false;
  const oldDate = new Date(change.old as string);
  const newDate = new Date(change.new as string);
  if (isNaN(oldDate.getTime()) || isNaN(newDate.getTime())) return false;
  return newDate > oldDate;
}

async function main() {
  console.log("Starting drift backfill...");

  // Get all tasks
  const tasks = await prisma.task.findMany({
    select: { id: true, status: true, completedAt: true, dueDate: true },
  });
  console.log(`Found ${tasks.length} tasks`);

  let updated = 0;

  for (const task of tasks) {
    // Get all events for this task, ordered chronologically
    const events = await prisma.taskEvent.findMany({
      where: { taskId: task.id },
      orderBy: { createdAt: "asc" },
    });

    let deferralCount = 0;
    let dueDatePushCount = 0;
    let originalDueDate: Date | null = null;

    for (const event of events) {
      const changes = event.changes as unknown as ChangeDiff | null;
      if (!changes) continue;

      // Count deferrals (DEFERRED event type)
      if (event.eventType === "DEFERRED") {
        deferralCount++;
      }

      // Count forward due-date shifts
      if (changes.dueDate && isForwardShift(changes.dueDate)) {
        dueDatePushCount++;
        // Track the earliest due date as originalDueDate
        if (!originalDueDate && changes.dueDate.old) {
          originalDueDate = new Date(changes.dueDate.old as string);
        }
      }
    }

    // Compute totalDriftDays for tasks that have been pushed
    let totalDriftDays = 0;
    if (originalDueDate) {
      const endDate = task.status === "COMPLETED" && task.completedAt
        ? task.completedAt
        : task.dueDate ?? new Date();
      const diffMs = endDate.getTime() - originalDueDate.getTime();
      totalDriftDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    }

    // Only update if there's something to set
    if (deferralCount > 0 || dueDatePushCount > 0) {
      await prisma.task.update({
        where: { id: task.id },
        data: {
          deferralCount,
          dueDatePushCount,
          originalDueDate,
          totalDriftDays,
        },
      });
      updated++;
    }
  }

  console.log(`Backfill complete. Updated ${updated} tasks.`);
}

main()
  .catch((e) => {
    console.error("Backfill failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
