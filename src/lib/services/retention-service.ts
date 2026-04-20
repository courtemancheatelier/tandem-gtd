import { prisma } from "@/lib/prisma";
import { PrismaClient } from "@prisma/client";
import { writeProjectEvent } from "@/lib/history/event-writer";
import { exportProjectTreeJson, exportProjectTreeCsv } from "@/lib/export/retention-export";
import fs from "fs/promises";
import path from "path";

type TxClient = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

interface RetentionSettings {
  retentionEnabled: boolean;
  retentionPeriodDays: number;
  retentionGraceDays: number;
  retentionExportPath: string | null;
  retentionExportKeepDays: number;
  retentionStandaloneTasks: boolean;
  retentionBatchSize: number;
}

const DEFAULT_SETTINGS: RetentionSettings = {
  retentionEnabled: false,
  retentionPeriodDays: 180,
  retentionGraceDays: 30,
  retentionExportPath: null,
  retentionExportKeepDays: 90,
  retentionStandaloneTasks: true,
  retentionBatchSize: 10,
};

export interface RetentionRunResult {
  dryRun: boolean;
  scheduled: { projectId: string; title: string }[];
  purged: { projectId: string; title: string; taskCount: number }[];
  standaloneTasks: number;
  exportsCleaned: number;
  errors: string[];
}

/**
 * Load retention settings from the singleton ServerSettings row.
 */
export async function getRetentionSettings(): Promise<RetentionSettings> {
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
  if (!settings) return DEFAULT_SETTINGS;
  return settings;
}

/**
 * Find root projects that are eligible for retention scheduling.
 * A project is eligible when:
 * - status is COMPLETED or DROPPED
 * - completedAt is at least retentionPeriodDays ago
 * - retentionExempt is false
 * - purgeScheduledAt is null (not already scheduled)
 * - parentProjectId is null (root projects only — children are purged with their root)
 * - all child projects are also COMPLETED or DROPPED
 */
export async function findEligibleTrees(
  settings: RetentionSettings
): Promise<{ id: string; title: string; userId: string; completedAt: Date }[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - settings.retentionPeriodDays);

  const candidates = await prisma.project.findMany({
    where: {
      status: { in: ["COMPLETED", "DROPPED"] },
      completedAt: { lte: cutoffDate },
      retentionExempt: false,
      purgeScheduledAt: null,
      parentProjectId: null,
    },
    select: { id: true, title: true, userId: true, completedAt: true },
  });

  // Filter out trees where any child is not closed
  const eligible: typeof candidates = [];
  for (const candidate of candidates) {
    const hasOpenChild = await hasOpenDescendant(candidate.id);
    if (!hasOpenChild) {
      eligible.push(candidate);
    }
  }

  return eligible as { id: string; title: string; userId: string; completedAt: Date }[];
}

async function hasOpenDescendant(projectId: string): Promise<boolean> {
  const children = await prisma.project.findMany({
    where: { parentProjectId: projectId },
    select: { id: true, status: true },
  });
  for (const child of children) {
    if (child.status !== "COMPLETED" && child.status !== "DROPPED") return true;
    if (await hasOpenDescendant(child.id)) return true;
  }
  return false;
}

/**
 * Schedule a purge for a project tree. Sets purgeScheduledAt, writes a
 * RETENTION_WARNING project event, creates a notification, and logs it.
 */
export async function schedulePurge(
  candidate: { id: string; title: string; userId: string },
  settings: RetentionSettings
): Promise<void> {
  const purgeDate = new Date();
  purgeDate.setDate(purgeDate.getDate() + settings.retentionGraceDays);

  await prisma.$transaction(async (tx: TxClient) => {
    await tx.project.update({
      where: { id: candidate.id },
      data: { purgeScheduledAt: purgeDate },
    });

    await writeProjectEvent(tx, candidate.id, "RETENTION_WARNING", {
      purgeScheduledAt: { old: null, new: purgeDate.toISOString() },
    }, {
      actorType: "SYSTEM",
      source: "SCHEDULER",
      message: `Scheduled for deletion on ${purgeDate.toISOString().slice(0, 10)}`,
    });

    await tx.notification.create({
      data: {
        userId: candidate.userId,
        type: "RETENTION_WARNING",
        title: "Project scheduled for deletion",
        body: `"${candidate.title}" will be permanently deleted on ${purgeDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}. Reactivate or exempt it to prevent deletion.`,
        link: `/projects/${candidate.id}`,
      },
    });

    await tx.retentionLog.create({
      data: {
        action: "SCHEDULED",
        projectId: candidate.id,
        projectTitle: candidate.title,
        actorType: "SYSTEM",
        details: { purgeDate: purgeDate.toISOString(), graceDays: settings.retentionGraceDays },
      },
    });
  });
}

/**
 * Find projects where purgeScheduledAt <= now and still closed.
 */
export async function findPurgeable(): Promise<
  { id: string; title: string; userId: string }[]
> {
  return prisma.project.findMany({
    where: {
      purgeScheduledAt: { lte: new Date() },
      status: { in: ["COMPLETED", "DROPPED"] },
      parentProjectId: null,
    },
    select: { id: true, title: true, userId: true },
  });
}

/**
 * Purge a project tree: export, then delete everything in a transaction.
 */
export async function purgeProjectTree(
  projectId: string,
  exportPath: string | null
): Promise<{ taskCount: number; eventCount: number; exportedJson?: string; exportedCsv?: string }> {
  // Collect all project IDs in the tree
  const allProjectIds = await collectProjectIds(projectId);

  // Export before deleting
  let exportedJson: string | undefined;
  let exportedCsv: string | undefined;
  if (exportPath) {
    try {
      exportedJson = await exportProjectTreeJson(projectId, exportPath);
      exportedCsv = await exportProjectTreeCsv(projectId, exportPath);
    } catch (err) {
      console.error(`[retention] Export failed for project ${projectId}:`, err);
      // Continue with purge even if export fails — data was already in grace period
    }
  }

  // Count what we're deleting for logging
  const taskCount = await prisma.task.count({
    where: { projectId: { in: allProjectIds } },
  });
  const eventCount = await prisma.projectEvent.count({
    where: { projectId: { in: allProjectIds } },
  });

  // Get all task IDs for the tree
  const taskIds = (
    await prisma.task.findMany({
      where: { projectId: { in: allProjectIds } },
      select: { id: true },
    })
  ).map((t) => t.id);

  // Delete in a single transaction — cascades handle most child records
  await prisma.$transaction(async (tx: TxClient) => {
    // Delete tasks first (cascades: TaskEvent, TaskSnapshot, TaskDependency; sets Notification.taskId to null)
    if (taskIds.length > 0) {
      await tx.task.deleteMany({ where: { id: { in: taskIds } } });
    }

    // Delete projects bottom-up (cascades: ProjectEvent, ProjectMember, BaselineSnapshot)
    // Reverse so children are deleted before parents
    for (const pid of allProjectIds.reverse()) {
      await tx.project.delete({ where: { id: pid } });
    }
  });

  // Log the purge
  await prisma.retentionLog.create({
    data: {
      action: "PURGED",
      projectId,
      projectTitle: (await prisma.retentionLog.findFirst({
        where: { projectId, action: "SCHEDULED" },
        select: { projectTitle: true },
        orderBy: { createdAt: "desc" },
      }))?.projectTitle ?? "Unknown",
      taskCount,
      eventCount,
      exportPath: exportedJson ?? null,
      actorType: "SYSTEM",
      details: {
        projectIds: allProjectIds,
        taskIds,
        exportedJson,
        exportedCsv,
      },
    },
  });

  return { taskCount, eventCount, exportedJson, exportedCsv };
}

/**
 * Purge standalone completed/dropped tasks older than the retention period.
 */
export async function purgeStandaloneTasks(
  settings: RetentionSettings
): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - settings.retentionPeriodDays);

  const result = await prisma.task.deleteMany({
    where: {
      projectId: null,
      status: { in: ["COMPLETED", "DROPPED"] },
      completedAt: { lte: cutoffDate },
    },
  });

  if (result.count > 0) {
    await prisma.retentionLog.create({
      data: {
        action: "STANDALONE_PURGED",
        taskCount: result.count,
        actorType: "SYSTEM",
        details: { cutoffDate: cutoffDate.toISOString() },
      },
    });
  }

  return result.count;
}

/**
 * Clean up old export files.
 */
export async function cleanupExports(
  settings: RetentionSettings
): Promise<number> {
  if (!settings.retentionExportPath) return 0;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - settings.retentionExportKeepDays);

  let cleaned = 0;
  try {
    const files = await fs.readdir(settings.retentionExportPath);
    for (const file of files) {
      if (!file.startsWith("retention-") || !file.endsWith(".enc")) continue;
      const filePath = path.join(settings.retentionExportPath, file);
      const stat = await fs.stat(filePath);
      if (stat.mtime <= cutoffDate) {
        await fs.unlink(filePath);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      await prisma.retentionLog.create({
        data: {
          action: "EXPORT_CLEANED",
          taskCount: 0,
          actorType: "SYSTEM",
          details: { filesRemoved: cleaned, cutoffDate: cutoffDate.toISOString() },
        },
      });
    }
  } catch (err) {
    console.error("[retention] Export cleanup failed:", err);
  }

  return cleaned;
}

/**
 * Main orchestrator for the retention system.
 */
export async function runRetention(options: {
  dryRun?: boolean;
  batchSize?: number;
  projectId?: string;
}): Promise<RetentionRunResult> {
  const settings = await getRetentionSettings();
  const result: RetentionRunResult = {
    dryRun: options.dryRun ?? false,
    scheduled: [],
    purged: [],
    standaloneTasks: 0,
    exportsCleaned: 0,
    errors: [],
  };

  if (!settings.retentionEnabled) {
    return result;
  }

  const batchSize = options.batchSize ?? settings.retentionBatchSize;

  // Phase 1: Schedule eligible trees for purge
  if (!options.projectId) {
    try {
      const eligible = await findEligibleTrees(settings);
      const toSchedule = eligible.slice(0, batchSize);

      for (const candidate of toSchedule) {
        if (options.dryRun) {
          result.scheduled.push({ projectId: candidate.id, title: candidate.title });
        } else {
          await schedulePurge(candidate, settings);
          result.scheduled.push({ projectId: candidate.id, title: candidate.title });
        }
      }
    } catch (err) {
      result.errors.push(`Schedule phase error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Phase 2: Purge trees past their grace period
  try {
    let toPurge: { id: string; title: string; userId: string }[];

    if (options.projectId) {
      // Targeted purge of a specific project
      const project = await prisma.project.findUnique({
        where: { id: options.projectId },
        select: { id: true, title: true, userId: true, status: true },
      });
      if (!project) {
        result.errors.push(`Project ${options.projectId} not found`);
        return result;
      }
      toPurge = [project];
    } else {
      toPurge = await findPurgeable();
      toPurge = toPurge.slice(0, batchSize);
    }

    for (const project of toPurge) {
      if (options.dryRun) {
        const allIds = await collectProjectIds(project.id);
        const taskCount = await prisma.task.count({
          where: { projectId: { in: allIds } },
        });
        result.purged.push({ projectId: project.id, title: project.title, taskCount });
      } else {
        try {
          const { taskCount } = await purgeProjectTree(project.id, settings.retentionExportPath);
          result.purged.push({ projectId: project.id, title: project.title, taskCount });
        } catch (err) {
          result.errors.push(`Purge error for ${project.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
  } catch (err) {
    result.errors.push(`Purge phase error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Phase 3: Standalone tasks
  if (settings.retentionStandaloneTasks && !options.projectId) {
    try {
      if (options.dryRun) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - settings.retentionPeriodDays);
        result.standaloneTasks = await prisma.task.count({
          where: {
            projectId: null,
            status: { in: ["COMPLETED", "DROPPED"] },
            completedAt: { lte: cutoffDate },
          },
        });
      } else {
        result.standaloneTasks = await purgeStandaloneTasks(settings);
      }
    } catch (err) {
      result.errors.push(`Standalone task error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Phase 4: Cleanup old exports
  if (!options.projectId && !options.dryRun) {
    try {
      result.exportsCleaned = await cleanupExports(settings);
    } catch (err) {
      result.errors.push(`Export cleanup error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}

/**
 * Collect all project IDs in a tree (root + all descendants).
 */
async function collectProjectIds(rootId: string): Promise<string[]> {
  const ids = [rootId];
  const children = await prisma.project.findMany({
    where: { parentProjectId: rootId },
    select: { id: true },
  });
  for (const child of children) {
    const childIds = await collectProjectIds(child.id);
    ids.push(...childIds);
  }
  return ids;
}
