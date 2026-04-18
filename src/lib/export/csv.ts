import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// RFC 4180 CSV helpers
// ---------------------------------------------------------------------------

function escapeField(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function row(fields: (string | number | boolean | null | undefined)[]): string {
  return fields.map(escapeField).join(",");
}

function d(date: Date | null | undefined): string {
  return date ? date.toISOString() : "";
}

// ---------------------------------------------------------------------------
// Tasks CSV
// ---------------------------------------------------------------------------

const TASK_HEADERS = [
  "title",
  "notes",
  "status",
  "isNextAction",
  "estimatedMins",
  "energyLevel",
  "scheduledDate",
  "dueDate",
  "project",
  "context",
  "createdAt",
  "completedAt",
];

export async function exportTasksCsv(
  userId: string,
  includeCompleted: boolean
): Promise<string> {
  const tasks = await prisma.task.findMany({
    where: {
      userId,
      ...(!includeCompleted && {
        status: { in: ["NOT_STARTED", "IN_PROGRESS", "WAITING"] },
      }),
    },
    include: {
      project: { select: { title: true } },
      context: { select: { name: true } },
    },
    orderBy: { sortOrder: "asc" },
  });

  const lines = [row(TASK_HEADERS)];
  for (const t of tasks) {
    lines.push(
      row([
        t.title,
        t.notes,
        t.status,
        t.isNextAction,
        t.estimatedMins,
        t.energyLevel,
        d(t.scheduledDate),
        d(t.dueDate),
        t.project?.title ?? null,
        t.context?.name ?? null,
        t.createdAt.toISOString(),
        d(t.completedAt),
      ])
    );
  }

  return lines.join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------------------
// Routine Logs CSV — one row per item per window log
// ---------------------------------------------------------------------------

const ROUTINE_LOG_HEADERS = [
  "date",
  "checkedAt",
  "routineName",
  "windowName",
  "windowTargetTime",
  "itemName",
  "itemDosage",
  "itemStatus",
  "windowStatus",
  "dayNumber",
];

export async function exportRoutineLogsCsv(userId: string): Promise<string> {
  const logs = await prisma.routineLog.findMany({
    where: { userId },
    include: {
      routine: {
        select: {
          title: true,
          windows: {
            include: {
              items: { orderBy: { sortOrder: "asc" } },
            },
          },
        },
      },
      window: {
        select: {
          title: true,
          targetTime: true,
          items: {
            select: { id: true, name: true, dosage: true },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
    },
    orderBy: [{ date: "asc" }, { routineId: "asc" }],
  });

  const lines = [row(ROUTINE_LOG_HEADERS)];
  for (const log of logs) {
    const dateStr = log.date.toISOString().slice(0, 10);
    const checkedAt = log.completedAt ? log.completedAt.toISOString() : "";
    const routineName = log.routine.title;
    const windowName = log.window.title;
    const windowTime = log.window.targetTime ?? "";

    // Expand to one row per item
    for (const item of log.window.items) {
      let itemStatus: string;
      if (log.status === "completed") {
        itemStatus = "taken";
      } else if (log.status === "skipped") {
        itemStatus = "skipped";
      } else if (log.status === "partial") {
        const taken = log.itemsTaken as string[] | null;
        itemStatus = taken?.includes(item.id) ? "taken" : "not_taken";
      } else {
        itemStatus = log.status; // missed or other
      }

      lines.push(
        row([
          dateStr,
          checkedAt,
          routineName,
          windowName,
          windowTime,
          item.name,
          item.dosage,
          itemStatus,
          log.status,
          log.dayNumber,
        ])
      );
    }
  }

  return lines.join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------------------
// Projects CSV
// ---------------------------------------------------------------------------

const PROJECT_HEADERS = [
  "title",
  "description",
  "status",
  "type",
  "outcome",
  "isSomedayMaybe",
  "area",
  "goal",
  "parentProject",
  "createdAt",
  "completedAt",
];

export async function exportProjectsCsv(
  userId: string,
  includeCompleted: boolean
): Promise<string> {
  const projects = await prisma.project.findMany({
    where: {
      userId,
      teamId: null,
      ...(!includeCompleted && {
        status: { in: ["ACTIVE", "ON_HOLD", "SOMEDAY_MAYBE"] },
      }),
    },
    include: {
      area: { select: { name: true } },
      goal: { select: { title: true } },
      parentProject: { select: { title: true } },
    },
    orderBy: [{ depth: "asc" }, { sortOrder: "asc" }],
  });

  const lines = [row(PROJECT_HEADERS)];
  for (const p of projects) {
    lines.push(
      row([
        p.title,
        p.description,
        p.status,
        p.type,
        p.outcome,
        p.isSomedayMaybe,
        p.area?.name ?? null,
        p.goal?.title ?? null,
        p.parentProject?.title ?? null,
        p.createdAt.toISOString(),
        d(p.completedAt),
      ])
    );
  }

  return lines.join("\r\n") + "\r\n";
}
