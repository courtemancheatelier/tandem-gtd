/**
 * One-time fix: move recurring tasks scheduled for tomorrow back to today.
 *
 * The timezone bug in getNextOccurrence caused tasks completed after 8 PM EDT
 * to be scheduled for the day after tomorrow (UTC). This script finds those
 * tasks and adjusts their scheduledDate to today (midnight UTC).
 *
 * Usage: npx tsx scripts/fix-recurring-dates.ts [--dry-run]
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

async function main() {
  const now = new Date();
  const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const tomorrowUTC = new Date(todayUTC);
  tomorrowUTC.setUTCDate(tomorrowUTC.getUTCDate() + 1);
  const dayAfterUTC = new Date(tomorrowUTC);
  dayAfterUTC.setUTCDate(dayAfterUTC.getUTCDate() + 1);

  console.log(`Today (UTC):    ${todayUTC.toISOString()}`);
  console.log(`Tomorrow (UTC): ${tomorrowUTC.toISOString()}`);
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}\n`);

  // Find recurring tasks scheduled for tomorrow that should be today
  const tasks = await prisma.task.findMany({
    where: {
      recurringTemplateId: { not: null },
      status: { notIn: ["COMPLETED", "DROPPED"] },
      scheduledDate: { gte: tomorrowUTC, lt: dayAfterUTC },
    },
    include: {
      recurringTemplate: { select: { id: true, cronExpression: true } },
    },
  });

  console.log(`Found ${tasks.length} recurring task(s) scheduled for tomorrow:\n`);

  for (const task of tasks) {
    console.log(`  - "${task.title}" (${task.recurringTemplate?.cronExpression})`);
    console.log(`    scheduled: ${task.scheduledDate?.toISOString()} → ${todayUTC.toISOString()}`);

    if (!dryRun) {
      await prisma.task.update({
        where: { id: task.id },
        data: { scheduledDate: todayUTC },
      });
    }
  }

  // Also fix template nextDue values that point to tomorrow
  // (they should stay at tomorrow — that's correct after the task is moved to today)
  // No change needed for templates.

  console.log(`\n${dryRun ? "Would update" : "Updated"} ${tasks.length} task(s).`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
