import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api/auth-helpers";
import { scheduleLabel } from "@/lib/recurring";

/**
 * GET /api/tasks/card-file
 * Returns recurring tasks split by scheduledDate vs today for the Card File view.
 */
export async function GET() {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const now = new Date();
  const startOfToday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const endOfToday = new Date(startOfToday);
  endOfToday.setUTCDate(endOfToday.getUTCDate() + 1);

  // Get all active (non-completed/dropped) tasks linked to recurring templates
  const tasks = await prisma.task.findMany({
    where: {
      userId,
      recurringTemplateId: { not: null },
      status: { notIn: ["COMPLETED", "DROPPED"] },
    },
    include: {
      context: { select: { id: true, name: true, color: true } },
      project: { select: { id: true, title: true } },
      recurringTemplate: {
        select: {
          id: true,
          cronExpression: true,
          color: true,
          estimatedMins: true,
          skipStreak: true,
        },
      },
    },
    orderBy: { scheduledDate: "asc" },
  });

  const overdue: typeof tasks = [];
  const today: typeof tasks = [];
  const upcoming: typeof tasks = [];

  for (const task of tasks) {
    const scheduled = task.scheduledDate;
    if (!scheduled || scheduled < startOfToday) {
      overdue.push(task);
    } else if (scheduled >= startOfToday && scheduled < endOfToday) {
      today.push(task);
    } else {
      upcoming.push(task);
    }
  }

  const mapTask = (task: (typeof tasks)[number]) => ({
    id: task.id,
    title: task.title,
    notes: task.notes,
    status: task.status,
    scheduledDate: task.scheduledDate?.toISOString() ?? null,
    dueDate: task.dueDate?.toISOString() ?? null,
    estimatedMins: task.estimatedMins ?? task.recurringTemplate?.estimatedMins ?? null,
    energyLevel: task.energyLevel,
    version: task.version,
    context: task.context,
    project: task.project,
    recurringTemplate: task.recurringTemplate
      ? {
          id: task.recurringTemplate.id,
          color: task.recurringTemplate.color,
          estimatedMins: task.recurringTemplate.estimatedMins,
          scheduleLabel: scheduleLabel(task.recurringTemplate.cronExpression),
          skipStreak: task.recurringTemplate.skipStreak,
        }
      : null,
  });

  return NextResponse.json({
    overdue: overdue.map(mapTask),
    today: today.map(mapTask),
    upcoming: upcoming.map(mapTask),
  });
}
