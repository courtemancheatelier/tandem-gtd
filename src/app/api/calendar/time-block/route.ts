import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest, notFound } from "@/lib/api/auth-helpers";
import { createTimeBlockSchema } from "@/lib/validations/calendar-event";
import { syncEventToGoogle } from "@/lib/google-calendar/sync-write";

export async function POST(req: NextRequest) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();
  const parsed = createTimeBlockSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  const { taskId, date, startTime, durationMinutes } = parsed.data;

  // Verify task ownership
  const task = await prisma.task.findFirst({
    where: { id: taskId, userId },
    select: { id: true, title: true },
  });
  if (!task) return notFound("Task not found");

  // Compute start and end DateTimes
  const dateObj = new Date(date);
  const startDateTime = new Date(startTime);
  const endDateTime = new Date(startDateTime.getTime() + durationMinutes * 60 * 1000);

  const [event] = await prisma.$transaction([
    prisma.calendarEvent.create({
      data: {
        title: task.title,
        eventType: "TIME_BLOCK",
        date: dateObj,
        startTime: startDateTime,
        endTime: endDateTime,
        taskId: task.id,
        userId,
      },
      include: {
        task: { select: { id: true, title: true } },
        project: { select: { id: true, title: true } },
      },
    }),
    // Set the task's due date to the time block date
    prisma.task.update({
      where: { id: taskId },
      data: { dueDate: dateObj },
    }),
  ]);

  // Fire-and-forget: sync to Google Calendar
  syncEventToGoogle(event.id, "create").catch((err) => console.error("[google-calendar] sync failed:", err));

  return NextResponse.json(event, { status: 201 });
}
