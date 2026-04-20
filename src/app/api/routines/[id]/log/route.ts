import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound, badRequest } from "@/lib/api/auth-helpers";
import { z } from "zod";
import { getDayNumber } from "@/lib/routine-dosing";
import { completeTask } from "@/lib/services/task-service";

const logSchema = z.object({
  windowId: z.string(),
  date: z.string(), // ISO date string (YYYY-MM-DD)
  status: z.enum(["completed", "skipped", "missed", "partial"]),
  reason: z.string().nullable().optional(),
  itemsTaken: z.array(z.string()).nullable().optional(), // item IDs, null = all
});

const toggleItemSchema = z.object({
  windowId: z.string(),
  date: z.string(),
  itemId: z.string(),
  taken: z.boolean(),
});

/** POST /api/routines/:id/log — check off or skip a window */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const routine = await prisma.routine.findFirst({
    where: { id: params.id, userId },
    include: {
      windows: {
        include: { items: { select: { id: true } } },
      },
    },
  });
  if (!routine) return notFound("Routine not found");

  const body = await req.json();
  const parsed = logSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.message);
  const data = parsed.data;

  // Verify window belongs to this routine
  const window = routine.windows.find((w) => w.id === data.windowId);
  if (!window) return badRequest("Window not found in this routine");

  const dateObj = new Date(data.date + "T00:00:00.000Z");

  // Compute day number for dynamic routines
  const dayNum =
    routine.routineType === "dynamic" && routine.startDate
      ? getDayNumber(routine.startDate, dateObj)
      : null;

  // Determine itemsTaken value for Prisma JSON field
  const itemsTakenValue: Prisma.InputJsonValue | typeof Prisma.DbNull =
    data.itemsTaken != null
      ? (data.itemsTaken as unknown as Prisma.InputJsonValue)
      : Prisma.DbNull;

  // Upsert — allow toggling status
  const log = await prisma.routineLog.upsert({
    where: {
      routineId_windowId_date: {
        routineId: params.id,
        windowId: data.windowId,
        date: dateObj,
      },
    },
    create: {
      routineId: params.id,
      windowId: data.windowId,
      date: dateObj,
      dayNumber: dayNum,
      status: data.status,
      reason: data.reason,
      itemsTaken: itemsTakenValue,
      completedAt: data.status === "completed" ? new Date() : null,
      userId,
    },
    update: {
      status: data.status,
      reason: data.reason,
      itemsTaken: itemsTakenValue,
      completedAt: data.status === "completed" ? new Date() : null,
    },
  });

  // Check if all windows are now completed/skipped for this date
  const allWindowIds = routine.windows.map((w) => w.id);
  const logsForDate = await prisma.routineLog.findMany({
    where: {
      routineId: params.id,
      date: dateObj,
      status: { in: ["completed", "skipped"] },
    },
  });

  const allDone = allWindowIds.every((wId) =>
    logsForDate.some((l) => l.windowId === wId)
  );

  if (allDone) {
    const startOfDay = dateObj;
    const endOfDay = new Date(dateObj);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const tasksToComplete = await prisma.task.findMany({
      where: {
        routineId: params.id,
        userId,
        status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
        scheduledDate: { gte: startOfDay, lt: endOfDay },
      },
      select: { id: true },
    });

    for (const t of tasksToComplete) {
      try {
        await completeTask(t.id, userId, {
          actorType: "USER",
          actorId: userId,
          source: "MANUAL",
        });
      } catch {
        // Task may already be completed or deleted — continue
      }
    }
  }

  return NextResponse.json({ log, allWindowsComplete: allDone });
}

/** PATCH /api/routines/:id/log — toggle a single item within a window */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("PATCH");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const routine = await prisma.routine.findFirst({
    where: { id: params.id, userId },
    include: {
      windows: {
        include: { items: { select: { id: true } } },
      },
    },
  });
  if (!routine) return notFound("Routine not found");

  const body = await req.json();
  const parsed = toggleItemSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.message);
  const data = parsed.data;

  const window = routine.windows.find((w) => w.id === data.windowId);
  if (!window) return badRequest("Window not found in this routine");

  // Verify item belongs to this window
  const itemExists = window.items.some((i) => i.id === data.itemId);
  if (!itemExists) return badRequest("Item not found in this window");

  const dateObj = new Date(data.date + "T00:00:00.000Z");
  const allItemIds = window.items.map((i) => i.id);

  // Get existing log
  const existing = await prisma.routineLog.findUnique({
    where: {
      routineId_windowId_date: {
        routineId: params.id,
        windowId: data.windowId,
        date: dateObj,
      },
    },
  });

  // Compute current itemsTaken set
  let currentTaken: Set<string>;
  if (!existing) {
    currentTaken = new Set();
  } else if (existing.itemsTaken == null) {
    // null means all items were taken (completed status)
    currentTaken = new Set(allItemIds);
  } else {
    currentTaken = new Set(existing.itemsTaken as string[]);
  }

  // Toggle the item
  if (data.taken) {
    currentTaken.add(data.itemId);
  } else {
    currentTaken.delete(data.itemId);
  }

  const takenArray = Array.from(currentTaken);
  const allTaken = takenArray.length === allItemIds.length && allItemIds.every((id) => currentTaken.has(id));
  const noneTaken = takenArray.length === 0;

  // Determine status
  let status: string;
  if (allTaken) {
    status = "completed";
  } else if (noneTaken) {
    // If unchecking the last item, delete the log entirely
    if (existing) {
      await prisma.routineLog.delete({
        where: { id: existing.id },
      });
    }
    return NextResponse.json({ log: null, status: "none" });
  } else {
    status = "partial";
  }

  const dayNum =
    routine.routineType === "dynamic" && routine.startDate
      ? getDayNumber(routine.startDate, dateObj)
      : null;

  const itemsTakenValue: Prisma.InputJsonValue | typeof Prisma.DbNull =
    allTaken ? Prisma.DbNull : (takenArray as unknown as Prisma.InputJsonValue);

  const log = await prisma.routineLog.upsert({
    where: {
      routineId_windowId_date: {
        routineId: params.id,
        windowId: data.windowId,
        date: dateObj,
      },
    },
    create: {
      routineId: params.id,
      windowId: data.windowId,
      date: dateObj,
      dayNumber: dayNum,
      status,
      itemsTaken: itemsTakenValue,
      completedAt: status === "completed" ? new Date() : null,
      userId,
    },
    update: {
      status,
      itemsTaken: itemsTakenValue,
      completedAt: status === "completed" ? new Date() : null,
    },
  });

  // Check if all windows are now completed or skipped — auto-complete task
  const allWindowIds = routine.windows.map((w) => w.id);
  const logsForDate = await prisma.routineLog.findMany({
    where: {
      routineId: params.id,
      date: dateObj,
      status: { in: ["completed", "skipped"] },
    },
  });

  const allDone = allWindowIds.every((wId) =>
    logsForDate.some((l) => l.windowId === wId)
  );

  if (allDone) {
    const startOfDay = dateObj;
    const endOfDay = new Date(dateObj);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const tasksToComplete = await prisma.task.findMany({
      where: {
        routineId: params.id,
        userId,
        status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
        scheduledDate: { gte: startOfDay, lt: endOfDay },
      },
      select: { id: true },
    });

    for (const t of tasksToComplete) {
      try {
        await completeTask(t.id, userId, {
          actorType: "USER",
          actorId: userId,
          source: "MANUAL",
        });
      } catch {
        // Task may already be completed or deleted — continue
      }
    }
  }

  return NextResponse.json({ log, status, allWindowsComplete: allDone });
}

/** DELETE /api/routines/:id/log — undo a window check-off */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("DELETE");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { searchParams } = new URL(req.url);
  const windowId = searchParams.get("windowId");
  const date = searchParams.get("date");

  if (!windowId || !date) return badRequest("windowId and date required");

  const dateObj = new Date(date + "T00:00:00.000Z");

  await prisma.routineLog.deleteMany({
    where: {
      routineId: params.id,
      windowId,
      date: dateObj,
      userId,
    },
  });

  return NextResponse.json({ success: true });
}

/** GET /api/routines/:id/log — get logs for a date range */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const where: Record<string, unknown> = {
    routineId: params.id,
    userId,
  };

  if (date) {
    where.date = new Date(date + "T00:00:00.000Z");
  } else if (from && to) {
    where.date = {
      gte: new Date(from + "T00:00:00.000Z"),
      lte: new Date(to + "T00:00:00.000Z"),
    };
  }

  const logs = await prisma.routineLog.findMany({
    where,
    orderBy: { date: "asc" },
  });

  return NextResponse.json(logs);
}
