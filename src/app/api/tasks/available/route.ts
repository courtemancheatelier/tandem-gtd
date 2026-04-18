import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api/auth-helpers";
import { TaskStatus, ProjectStatus } from "@prisma/client";
import { scheduleLabel } from "@/lib/recurring";
import { getDayNumber, resolveDosage, getPreviousDosage } from "@/lib/routine-dosing";

/**
 * "What Should I Do Now?" — the cross-project available tasks query.
 * Returns tasks that are:
 * - Next actions (isNextAction = true)
 * - Not completed or dropped
 * - In active projects (or standalone)
 * - Not scheduled for the future
 * - Optionally filtered by context, energy, time
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { searchParams } = new URL(req.url);
  const contextId = searchParams.get("contextId");
  const maxMins = searchParams.get("maxMins");
  const energyLevel = searchParams.get("energyLevel");

  const now = new Date();

  // Update lastWhatNowAt for tandem-manage behavioral tracking (throttled to once per hour)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { lastWhatNowAt: true },
  });
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  if (!user?.lastWhatNowAt || user.lastWhatNowAt < oneHourAgo) {
    await prisma.user.update({
      where: { id: userId },
      data: { lastWhatNowAt: now },
    });
  }

  const where: Record<string, unknown> = {
    userId,
    isNextAction: true,
    status: { in: [TaskStatus.NOT_STARTED, TaskStatus.IN_PROGRESS] },
    OR: [
      { scheduledDate: null },
      { scheduledDate: { lte: now } },
    ],
    // Only from active projects or standalone (no project)
    AND: [
      {
        OR: [
          { projectId: null },
          { project: { status: ProjectStatus.ACTIVE } },
        ],
      },
    ],
  };

  if (contextId) where.contextId = contextId;
  if (maxMins) where.estimatedMins = { lte: parseInt(maxMins) };
  if (energyLevel) where.energyLevel = energyLevel;

  const projectSelect = {
    id: true, title: true, type: true, completionNotesEnabled: true,
    team: { select: { id: true, name: true, icon: true } },
    parentProject: {
      select: {
        id: true, title: true,
        parentProject: { select: { id: true, title: true } },
      },
    },
  };

  const tasks = await prisma.task.findMany({
    where,
    include: {
      project: { select: projectSelect },
      context: { select: { id: true, name: true, color: true } },
      routine: {
        select: {
          id: true,
          cronExpression: true,
          color: true,
          estimatedMins: true,
          routineType: true,
          startDate: true,
          totalDays: true,
          windows: {
            orderBy: { sortOrder: "asc" },
            include: {
              items: { orderBy: { sortOrder: "asc" } },
            },
          },
        },
      },
    },
    orderBy: [
      { dueDate: "asc" },
      { sortOrder: "asc" },
    ],
  });

  // Enrich routine tasks with logs and resolved dosages
  const prefs = await prisma.notificationPreference.findUnique({
    where: { userId },
    select: { timezone: true },
  });
  const timezone = prefs?.timezone || "America/New_York";
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const parts = formatter.formatToParts(now);
  const localYear = parseInt(parts.find((p) => p.type === "year")!.value);
  const localMonth = parseInt(parts.find((p) => p.type === "month")!.value) - 1;
  const localDay = parseInt(parts.find((p) => p.type === "day")!.value);
  const startOfToday = new Date(Date.UTC(localYear, localMonth, localDay));
  const endOfToday = new Date(startOfToday);
  endOfToday.setUTCDate(endOfToday.getUTCDate() + 1);

  // Also fetch waiting-for items and due-soon tasks
  const waitingFor = await prisma.waitingFor.findMany({
    where: { userId, isResolved: false },
    orderBy: { dueDate: "asc" },
    take: 10,
  });

  const dueSoon = await prisma.task.findMany({
    where: {
      userId,
      status: { in: [TaskStatus.NOT_STARTED, TaskStatus.IN_PROGRESS] },
      dueDate: {
        lte: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000), // Next 3 days
        gte: now,
      },
    },
    include: {
      project: { select: projectSelect },
      context: { select: { id: true, name: true, color: true } },
      routine: {
        select: {
          id: true,
          cronExpression: true,
          color: true,
          estimatedMins: true,
          routineType: true,
          startDate: true,
          totalDays: true,
          windows: {
            orderBy: { sortOrder: "asc" },
            include: {
              items: { orderBy: { sortOrder: "asc" } },
            },
          },
        },
      },
    },
    orderBy: { dueDate: "asc" },
  });

  // Fetch today's routine logs for all protocol tasks
  const allTasks = [...tasks, ...dueSoon];
  const routineIds = Array.from(new Set(
    allTasks.filter((t) => t.routineId).map((t) => t.routineId!)
  ));
  const routineLogs = routineIds.length > 0
    ? await prisma.routineLog.findMany({
        where: {
          routineId: { in: routineIds },
          date: { gte: startOfToday, lt: endOfToday },
        },
      })
    : [];

  function enrichTask(task: (typeof allTasks)[number]) {
    if (!task.routine) return task;

    const hp = task.routine;
    const isDynamic = hp.routineType === "dynamic" && hp.startDate;
    const taskDate = task.scheduledDate ?? new Date();
    const dayNumber = isDynamic ? getDayNumber(hp.startDate!, taskDate) : null;

    return {
      ...task,
      routine: {
        id: hp.id,
        color: hp.color,
        estimatedMins: hp.estimatedMins,
        scheduleLabel: scheduleLabel(hp.cronExpression),
        routineType: hp.routineType,
        dayNumber,
        totalDays: hp.totalDays,
        windows: hp.windows.map((w) => ({
          id: w.id,
          title: w.title,
          targetTime: w.targetTime,
          sortOrder: w.sortOrder,
          constraint: w.constraint,
          items: w.items.map((item) => {
            const resolvedDosage = dayNumber != null
              ? resolveDosage(item.dosage, item.rampSchedule, dayNumber)
              : item.dosage;
            const prevDosage = dayNumber != null
              ? getPreviousDosage(item.dosage, item.rampSchedule, dayNumber)
              : null;
            return {
              id: item.id,
              name: item.name,
              dosage: resolvedDosage,
              form: item.form,
              notes: item.notes,
              dosageChanged: prevDosage != null && prevDosage !== resolvedDosage,
            };
          }),
          log: routineLogs.find(
            (l) => l.routineId === task.routineId && l.windowId === w.id
          ) ?? null,
        })),
      },
    };
  }

  // Current time as HH:MM in user's timezone for window time gating
  const timeFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const timeParts = timeFmt.formatToParts(now);
  const nowHHMM = `${timeParts.find((p) => p.type === "hour")!.value}:${timeParts.find((p) => p.type === "minute")!.value}`;

  const enrichedDoNow = tasks.map(enrichTask);
  const enrichedDueSoon = dueSoon.map(enrichTask);

  // Filter out routine tasks where no actionable window is ready yet.
  // A routine card appears in Do Now once its earliest uncompleted window's
  // targetTime has arrived (or if any uncompleted window has no targetTime).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function isRoutineActionable(task: any): boolean {
    const hp = task.routine;
    if (!hp || !hp.windows) return true; // non-routine tasks always pass
    const uncompletedWindows = hp.windows.filter(
      (w: { log?: { status: string } | null }) =>
        !w.log || (w.log.status !== "completed" && w.log.status !== "skipped")
    );
    if (uncompletedWindows.length === 0) return true; // all done, show card
    return uncompletedWindows.some(
      (w: { targetTime?: string | null }) => !w.targetTime || w.targetTime <= nowHHMM
    );
  }

  return NextResponse.json({
    doNow: enrichedDoNow.filter(isRoutineActionable),
    waitingFor,
    dueSoon: enrichedDueSoon.filter(isRoutineActionable),
  });
}
