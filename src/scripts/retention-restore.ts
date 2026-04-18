/**
 * Restore a project tree from a decrypted retention export JSON file.
 *
 * Usage:
 *   npx tsx src/scripts/retention-restore.ts /path/to/file.json
 *   npx tsx src/scripts/retention-restore.ts /path/to/file.json --user-id=<userId>
 *
 * Notes:
 *   - New IDs are generated (original IDs noted in task notes)
 *   - Events and snapshots are NOT restored
 *   - Project is created as ACTIVE
 *   - Contexts are matched by name (must exist for the user)
 */

import { PrismaClient } from "@prisma/client";
import fs from "fs/promises";

const prisma = new PrismaClient();

interface ExportTask {
  id: string;
  title: string;
  notes: string | null;
  status: string;
  isNextAction: boolean;
  estimatedMins: number | null;
  energyLevel: string | null;
  dueDate: string | null;
  scheduledDate: string | null;
  completedAt: string | null;
  sortOrder: number;
  contextName: string | null;
  assignedToName: string | null;
  createdAt: string;
}

interface ExportProject {
  version: number;
  retentionExport: boolean;
  project: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    type: string;
    childType: string;
    outcome: string | null;
    completedAt: string | null;
    createdAt: string;
  };
  tasks: ExportTask[];
  subProjects: ExportProject[];
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath || filePath.startsWith("--")) {
    console.error("Usage: npx tsx src/scripts/retention-restore.ts <file.json> [--user-id=<id>]");
    process.exit(1);
  }

  let userId: string | undefined;
  for (const arg of process.argv.slice(3)) {
    if (arg.startsWith("--user-id=")) {
      userId = arg.split("=")[1];
    }
  }

  const content = await fs.readFile(filePath, "utf-8");
  const data: ExportProject = JSON.parse(content);

  if (!data.retentionExport || !data.project) {
    console.error("File does not appear to be a retention export.");
    process.exit(1);
  }

  // Find or prompt for user
  if (!userId) {
    const admins = await prisma.user.findMany({
      where: { isAdmin: true, isDisabled: false },
      select: { id: true, name: true, email: true },
      take: 1,
    });
    if (admins.length === 0) {
      console.error("No admin user found. Specify --user-id=<id>");
      process.exit(1);
    }
    userId = admins[0].id;
    console.log(`Using admin user: ${admins[0].name} (${admins[0].email})\n`);
  }

  // Load user's contexts for matching
  const contexts = await prisma.context.findMany({
    where: { userId },
    select: { id: true, name: true },
  });
  const contextMap = new Map(contexts.map((c) => [c.name, c.id]));

  console.log(`Restoring: "${data.project.title}"\n`);

  const stats = { projects: 0, tasks: 0 };
  await restoreTree(data, userId, null, contextMap, stats);

  console.log(`\nRestored: ${stats.projects} project(s), ${stats.tasks} task(s)`);
  await prisma.$disconnect();
}

async function restoreTree(
  data: ExportProject,
  userId: string,
  parentProjectId: string | null,
  contextMap: Map<string, string>,
  stats: { projects: number; tasks: number }
): Promise<void> {
  const project = await prisma.project.create({
    data: {
      title: data.project.title + " (restored)",
      description: data.project.description,
      status: "ACTIVE",
      type: data.project.type as "SEQUENTIAL" | "PARALLEL" | "SINGLE_ACTIONS",
      childType: data.project.childType as "SEQUENTIAL" | "PARALLEL",
      outcome: data.project.outcome,
      userId,
      parentProjectId: parentProjectId,
    },
  });
  stats.projects++;
  console.log(`  Project: ${project.title} (${project.id})`);

  for (const task of data.tasks) {
    const contextId = task.contextName ? contextMap.get(task.contextName) ?? null : null;

    await prisma.task.create({
      data: {
        title: task.title,
        notes: task.notes
          ? `${task.notes}\n\n---\nRestored from retention export. Original ID: ${task.id}`
          : `Restored from retention export. Original ID: ${task.id}`,
        status: "NOT_STARTED",
        isNextAction: false,
        estimatedMins: task.estimatedMins,
        energyLevel: task.energyLevel as "LOW" | "MEDIUM" | "HIGH" | null,
        dueDate: task.dueDate ? new Date(task.dueDate) : null,
        scheduledDate: task.scheduledDate ? new Date(task.scheduledDate) : null,
        sortOrder: task.sortOrder,
        userId,
        projectId: project.id,
        contextId,
      },
    });
    stats.tasks++;
  }

  for (const sub of data.subProjects) {
    await restoreTree(sub, userId, project.id, contextMap, stats);
  }
}

main().catch((err) => {
  console.error("Restore error:", err);
  process.exit(1);
});
