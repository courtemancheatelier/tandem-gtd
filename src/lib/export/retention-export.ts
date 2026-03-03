import { prisma } from "@/lib/prisma";
import { encryptFile } from "@/lib/ai/crypto";
import fs from "fs/promises";
import path from "path";

interface RetentionProjectExport {
  version: 1;
  exportedAt: string;
  retentionExport: true;
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
    updatedAt: string;
  };
  tasks: RetentionTaskExport[];
  events: RetentionEventExport[];
  snapshots: RetentionSnapshotExport[];
  subProjects: RetentionProjectExport[];
}

interface RetentionTaskExport {
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

interface RetentionEventExport {
  id: string;
  eventType: string;
  changes: unknown;
  message: string | null;
  source: string;
  actorType: string;
  createdAt: string;
}

interface RetentionSnapshotExport {
  id: string;
  taskId: string;
  state: unknown;
  reason: string;
  createdAt: string;
}

/**
 * Export a project tree as hierarchical JSON for retention archival.
 * Output is encrypted (AES-256-GCM) — plaintext is never left on disk.
 */
export async function exportProjectTreeJson(
  projectId: string,
  outputDir: string
): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true });

  const tree = await buildProjectTreeExport(projectId);
  const filename = `retention-${projectId}-${Date.now()}.json`;
  const filePath = path.join(outputDir, filename);

  await fs.writeFile(filePath, JSON.stringify(tree, null, 2), "utf-8");
  const encPath = await encryptFile(filePath);
  return encPath;
}

/**
 * Export a project tree as flat CSV for retention archival.
 * Includes all tasks from the project and its sub-projects.
 * Output is encrypted (AES-256-GCM) — plaintext is never left on disk.
 */
export async function exportProjectTreeCsv(
  projectId: string,
  outputDir: string
): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true });

  const allProjectIds = await collectProjectIds(projectId);

  const tasks = await prisma.task.findMany({
    where: { projectId: { in: allProjectIds } },
    include: {
      project: { select: { title: true } },
      context: { select: { name: true } },
    },
    orderBy: [{ projectId: "asc" }, { sortOrder: "asc" }],
  });

  const headers = [
    "title",
    "status",
    "project",
    "completedAt",
    "estimatedMins",
    "context",
    "energyLevel",
    "notes",
  ];

  const rows = tasks.map((t) => [
    csvEscape(t.title),
    t.status,
    csvEscape(t.project?.title ?? ""),
    t.completedAt?.toISOString() ?? "",
    t.estimatedMins?.toString() ?? "",
    t.context?.name ?? "",
    t.energyLevel ?? "",
    csvEscape(t.notes ?? ""),
  ]);

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

  const filename = `retention-${projectId}-${Date.now()}.csv`;
  const filePath = path.join(outputDir, filename);

  await fs.writeFile(filePath, csv, "utf-8");
  const encPath = await encryptFile(filePath);
  return encPath;
}

async function buildProjectTreeExport(
  projectId: string
): Promise<RetentionProjectExport> {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      tasks: {
        include: {
          context: { select: { name: true } },
          assignedTo: { select: { name: true } },
          snapshots: {
            select: { id: true, taskId: true, state: true, reason: true, createdAt: true },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
      events: {
        select: {
          id: true,
          eventType: true,
          changes: true,
          message: true,
          source: true,
          actorType: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      },
      childProjects: { select: { id: true } },
    },
  });

  const snapshots: RetentionSnapshotExport[] = [];
  const tasks: RetentionTaskExport[] = project.tasks.map((t) => {
    for (const s of t.snapshots) {
      snapshots.push({
        id: s.id,
        taskId: s.taskId,
        state: s.state,
        reason: s.reason,
        createdAt: s.createdAt.toISOString(),
      });
    }
    return {
      id: t.id,
      title: t.title,
      notes: t.notes,
      status: t.status,
      isNextAction: t.isNextAction,
      estimatedMins: t.estimatedMins,
      energyLevel: t.energyLevel,
      dueDate: t.dueDate?.toISOString() ?? null,
      scheduledDate: t.scheduledDate?.toISOString() ?? null,
      completedAt: t.completedAt?.toISOString() ?? null,
      sortOrder: t.sortOrder,
      contextName: t.context?.name ?? null,
      assignedToName: t.assignedTo?.name ?? null,
      createdAt: t.createdAt.toISOString(),
    };
  });

  const events: RetentionEventExport[] = project.events.map((e) => ({
    id: e.id,
    eventType: e.eventType,
    changes: e.changes,
    message: e.message,
    source: e.source,
    actorType: e.actorType,
    createdAt: e.createdAt.toISOString(),
  }));

  const subProjects: RetentionProjectExport[] = [];
  for (const child of project.childProjects) {
    subProjects.push(await buildProjectTreeExport(child.id));
  }

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    retentionExport: true,
    project: {
      id: project.id,
      title: project.title,
      description: project.description,
      status: project.status,
      type: project.type,
      childType: project.childType,
      outcome: project.outcome,
      completedAt: project.completedAt?.toISOString() ?? null,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    },
    tasks,
    events,
    snapshots,
    subProjects,
  };
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

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}
