import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest } from "@/lib/api/auth-helpers";
import { createCalendarEventSchema } from "@/lib/validations/calendar-event";
import { syncEventToGoogle } from "@/lib/google-calendar/sync-write";
import { expandRecurrence } from "@/lib/calendar/rrule";

export async function GET(req: NextRequest) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  if (!start || !end) {
    return badRequest("start and end query params are required");
  }

  const startDate = new Date(start);
  const endDate = new Date(end);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return badRequest("Invalid date format for start or end");
  }

  const includeExternal = searchParams.get("includeExternal") === "true";

  // 1. Fetch non-recurring events in the date range
  const nonRecurringWhere: Record<string, unknown> = {
    userId,
    date: { gte: startDate, lte: endDate },
    recurrenceRule: null, // Not a recurring parent
    recurringEventId: null, // Not a materialized exception (handled below)
  };

  if (!includeExternal) {
    nonRecurringWhere.syncStatus = { not: "EXTERNAL" as const };
  }

  // Also fetch events from the day before that cross midnight into our range
  const dayBeforeStart = new Date(startDate);
  dayBeforeStart.setDate(dayBeforeStart.getDate() - 1);
  dayBeforeStart.setHours(0, 0, 0, 0);
  const dayBeforeEnd = new Date(startDate);
  dayBeforeEnd.setDate(dayBeforeEnd.getDate() - 1);
  dayBeforeEnd.setHours(23, 59, 59, 999);

  const crossMidnightWhere: Record<string, unknown> = {
    userId,
    date: { gte: dayBeforeStart, lte: dayBeforeEnd },
    endTime: { gt: startDate }, // endTime extends past midnight into our range
    recurrenceRule: null,
    recurringEventId: null,
  };

  if (!includeExternal) {
    crossMidnightWhere.syncStatus = { not: "EXTERNAL" as const };
  }

  const [regularEvents, crossMidnightEvents] = await Promise.all([
    prisma.calendarEvent.findMany({
      where: nonRecurringWhere,
      include: {
        task: { select: { id: true, title: true } },
        project: { select: { id: true, title: true } },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
    prisma.calendarEvent.findMany({
      where: crossMidnightWhere,
      include: {
        task: { select: { id: true, title: true } },
        project: { select: { id: true, title: true } },
      },
    }),
  ]);

  // Merge, deduplicating by id
  const regularEventIds = new Set(regularEvents.map((e) => e.id));
  const allRegularEvents = [
    ...regularEvents,
    ...crossMidnightEvents.filter((e) => !regularEventIds.has(e.id)),
  ];

  // 2. Fetch recurring parents and expand into virtual instances
  const recurringParents = await prisma.calendarEvent.findMany({
    where: {
      userId,
      recurrenceRule: { not: null },
      recurringEventId: null, // Only parents, not exceptions
    },
    include: {
      task: { select: { id: true, title: true } },
      project: { select: { id: true, title: true } },
      recurringInstances: {
        where: { date: { gte: startDate, lte: endDate } },
        include: {
          task: { select: { id: true, title: true } },
          project: { select: { id: true, title: true } },
        },
      },
    },
  });

  // Build materialized exception map: parentId_dateISO → exception event
  const exceptionMap = new Map<string, typeof regularEvents[0]>();
  const virtualInstances: Array<Record<string, unknown>> = [];

  for (const parent of recurringParents) {
    const exceptions = parent.recurringInstances || [];
    for (const exc of exceptions) {
      const key = `${parent.id}_${exc.date.toISOString().slice(0, 10)}`;
      exceptionMap.set(key, exc);
    }

    const occurrences = expandRecurrence(
      parent.recurrenceRule!,
      parent.date,
      startDate,
      endDate,
      parent.excludedDates as string[] | null
    );

    for (const occ of occurrences) {
      const dateISO = occ.toISOString().slice(0, 10);
      const key = `${parent.id}_${dateISO}`;

      if (exceptionMap.has(key)) {
        // Use the materialized exception instead
        virtualInstances.push(exceptionMap.get(key)! as unknown as Record<string, unknown>);
      } else {
        // Create virtual instance
        const occDate = new Date(dateISO + "T00:00:00");
        let occStartTime: Date | null = null;
        let occEndTime: Date | null = null;

        if (parent.startTime) {
          const orig = parent.startTime;
          occStartTime = new Date(occ);
          occStartTime.setHours(orig.getHours(), orig.getMinutes(), orig.getSeconds());
        }
        if (parent.endTime) {
          const orig = parent.endTime;
          occEndTime = new Date(occ);
          occEndTime.setHours(orig.getHours(), orig.getMinutes(), orig.getSeconds());
        }

        virtualInstances.push({
          id: `${parent.id}_${dateISO}`,
          title: parent.title,
          description: parent.description,
          eventType: parent.eventType,
          date: occDate.toISOString(),
          startTime: occStartTime?.toISOString() ?? null,
          endTime: occEndTime?.toISOString() ?? null,
          allDay: parent.allDay,
          location: parent.location,
          reminderMinutes: parent.reminderMinutes,
          color: parent.color,
          syncStatus: parent.syncStatus,
          recurrenceRule: parent.recurrenceRule,
          recurringEventId: parent.id,
          isRecurringInstance: true,
          isVirtual: true,
          task: parent.task,
          project: parent.project,
          taskId: parent.taskId,
          projectId: parent.projectId,
          userId: parent.userId,
          createdAt: parent.createdAt,
          updatedAt: parent.updatedAt,
        });
      }
    }
  }

  // 3. Fetch tasks with due dates in range (shown as virtual calendar entries)
  const tasksWithDueDates = await prisma.task.findMany({
    where: {
      userId,
      dueDate: { gte: startDate, lte: endDate },
      completedAt: null, // Only incomplete tasks
    },
    select: {
      id: true,
      title: true,
      dueDate: true,
      projectId: true,
      project: { select: { id: true, title: true } },
    },
    orderBy: { dueDate: "asc" },
  });

  // Exclude tasks that already have a time block on their due date
  const tasksWithTimeBlocks = new Set(
    allRegularEvents
      .filter((e) => e.eventType === "TIME_BLOCK" && e.taskId)
      .map((e) => e.taskId)
  );
  const filteredTaskDeadlines = tasksWithDueDates.filter(
    (t) => !tasksWithTimeBlocks.has(t.id)
  );

  const taskDeadlines = filteredTaskDeadlines.map((t) => ({
    id: `task-due_${t.id}`,
    title: `📋 ${t.title}`,
    description: null,
    eventType: "DAY_SPECIFIC" as const,
    date: t.dueDate!.toISOString(),
    startTime: null,
    endTime: null,
    allDay: true,
    location: null,
    reminderMinutes: null,
    syncStatus: "TASK_DEADLINE" as const,
    googleEventId: null,
    googleCalendarId: null,
    recurrenceRule: null,
    recurringEventId: null,
    isRecurringInstance: false,
    isVirtual: true,
    task: { id: t.id, title: t.title },
    project: t.project,
    taskId: t.id,
    projectId: t.projectId,
    userId,
    createdAt: null,
    updatedAt: null,
  }));

  // 4. Merge and sort
  const allEvents = [
    ...allRegularEvents.map((e) => ({ ...e, isVirtual: false })),
    ...virtualInstances,
    ...taskDeadlines,
  ].sort((a, b) => {
    const dateA = new Date(a.date as string).getTime();
    const dateB = new Date(b.date as string).getTime();
    if (dateA !== dateB) return dateA - dateB;
    const startA = a.startTime ? new Date(a.startTime as string).getTime() : 0;
    const startB = b.startTime ? new Date(b.startTime as string).getTime() : 0;
    return startA - startB;
  });

  return NextResponse.json(allEvents);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();
  const parsed = createCalendarEventSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  const { date, startTime, endTime, ...rest } = parsed.data;

  // Verify ownership of linked task/project
  if (rest.taskId) {
    const task = await prisma.task.findFirst({ where: { id: rest.taskId, userId } });
    if (!task) return badRequest("Task not found or not owned by you");
  }
  if (rest.projectId) {
    const project = await prisma.project.findFirst({ where: { id: rest.projectId, userId } });
    if (!project) return badRequest("Project not found or not owned by you");
  }

  const event = await prisma.calendarEvent.create({
    data: {
      ...rest,
      date: new Date(date),
      startTime: startTime ? new Date(startTime) : null,
      endTime: endTime ? new Date(endTime) : null,
      userId,
    },
    include: {
      task: { select: { id: true, title: true } },
      project: { select: { id: true, title: true } },
    },
  });

  // Fire-and-forget: sync to Google Calendar
  syncEventToGoogle(event.id, "create").catch((err) => console.error("[google-calendar] sync failed:", err));

  return NextResponse.json(event, { status: 201 });
}
