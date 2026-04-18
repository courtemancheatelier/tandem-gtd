/**
 * CLI script for running the data retention system.
 *
 * Usage:
 *   npx tsx src/scripts/retention-purge.ts --dry-run          # default, shows what would happen
 *   npx tsx src/scripts/retention-purge.ts --execute           # actually purges
 *   npx tsx src/scripts/retention-purge.ts --execute --batch-size=5
 *   npx tsx src/scripts/retention-purge.ts --execute --project-id=<id>
 */

import { PrismaClient } from "@prisma/client";

// Initialize prisma directly (can't use @/ alias in standalone scripts)
const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes("--execute");
  const dryRun = !execute;

  let batchSize: number | undefined;
  let projectId: string | undefined;

  for (const arg of args) {
    if (arg.startsWith("--batch-size=")) {
      batchSize = parseInt(arg.split("=")[1], 10);
      if (isNaN(batchSize) || batchSize < 1) {
        console.error("Invalid --batch-size value");
        process.exit(1);
      }
    }
    if (arg.startsWith("--project-id=")) {
      projectId = arg.split("=")[1];
      if (!projectId) {
        console.error("Invalid --project-id value");
        process.exit(1);
      }
    }
  }

  console.log(`\n=== Retention ${dryRun ? "DRY RUN" : "EXECUTE"} ===\n`);

  // Load settings
  const settings = await prisma.serverSettings.findUnique({
    where: { id: "singleton" },
    select: {
      retentionEnabled: true,
      retentionPeriodDays: true,
      retentionGraceDays: true,
      retentionExportPath: true,
      retentionExportKeepDays: true,
      retentionStandaloneTasks: true,
      retentionBatchSize: true,
    },
  });

  if (!settings?.retentionEnabled) {
    console.log("Retention is disabled in server settings. Enable it first.");
    await prisma.$disconnect();
    process.exit(0);
  }

  console.log("Settings:", JSON.stringify(settings, null, 2));
  console.log();

  const effectiveBatch = batchSize ?? settings.retentionBatchSize;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - settings.retentionPeriodDays);

  // Phase 1: Find eligible trees to schedule
  if (!projectId) {
    const eligible = await prisma.project.findMany({
      where: {
        status: { in: ["COMPLETED", "DROPPED"] },
        completedAt: { lte: cutoffDate },
        retentionExempt: false,
        purgeScheduledAt: null,
        parentProjectId: null,
      },
      select: { id: true, title: true, completedAt: true },
      take: effectiveBatch,
    });

    console.log(`Phase 1: ${eligible.length} project(s) eligible for scheduling`);
    for (const p of eligible) {
      console.log(`  - ${p.title} (${p.id}) completed ${p.completedAt?.toISOString().slice(0, 10)}`);
    }

    if (!dryRun && eligible.length > 0) {
      // Dynamically import the service (uses @/ path resolution from tsx)
      const { schedulePurge, getRetentionSettings } = await import("../lib/services/retention-service");
      const s = await getRetentionSettings();
      for (const p of eligible) {
        const project = await prisma.project.findUnique({
          where: { id: p.id },
          select: { id: true, title: true, userId: true },
        });
        if (project) {
          await schedulePurge(project, s);
          console.log(`  -> Scheduled: ${p.title}`);
        }
      }
    }
    console.log();
  }

  // Phase 2: Find purgeable trees
  const purgeWhere = projectId
    ? { id: projectId }
    : {
        purgeScheduledAt: { lte: new Date() },
        status: { in: ["COMPLETED" as const, "DROPPED" as const] },
        parentProjectId: null,
      };

  const purgeable = await prisma.project.findMany({
    where: purgeWhere,
    select: { id: true, title: true },
    take: effectiveBatch,
  });

  console.log(`Phase 2: ${purgeable.length} project(s) ready for purge`);

  for (const p of purgeable) {
    const taskCount = await prisma.task.count({ where: { projectId: p.id } });
    console.log(`  - ${p.title} (${p.id}) — ${taskCount} tasks`);

    if (!dryRun) {
      const { purgeProjectTree } = await import("../lib/services/retention-service");
      const result = await purgeProjectTree(p.id, settings.retentionExportPath);
      console.log(`  -> Purged: ${result.taskCount} tasks, ${result.eventCount} events`);
      if (result.exportedJson) console.log(`  -> Exported: ${result.exportedJson}`);
    }
  }
  console.log();

  // Phase 3: Standalone tasks
  if (settings.retentionStandaloneTasks && !projectId) {
    const standaloneCount = await prisma.task.count({
      where: {
        projectId: null,
        status: { in: ["COMPLETED", "DROPPED"] },
        completedAt: { lte: cutoffDate },
      },
    });
    console.log(`Phase 3: ${standaloneCount} standalone task(s) eligible for purge`);

    if (!dryRun && standaloneCount > 0) {
      const { purgeStandaloneTasks } = await import("../lib/services/retention-service");
      const deleted = await purgeStandaloneTasks(settings as Parameters<typeof purgeStandaloneTasks>[0]);
      console.log(`  -> Purged: ${deleted} standalone tasks`);
    }
  }

  console.log("\n=== Done ===\n");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Retention script error:", err);
  process.exit(1);
});
