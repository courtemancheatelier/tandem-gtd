import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound, badRequest } from "@/lib/api/auth-helpers";
import { updateCalendarEventSchema } from "@/lib/validations/calendar-event";
import { syncEventToGoogle } from "@/lib/google-calendar/sync-write";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const event = await prisma.calendarEvent.findFirst({
    where: { id: params.id, userId },
    include: {
      task: { select: { id: true, title: true } },
      project: { select: { id: true, title: true } },
    },
  });

  if (!event) return notFound("Calendar event not found");
  return NextResponse.json(event);
}

/**
 * Parse a virtual instance ID like "parentId_2026-03-15" into parts.
 * Returns null if not a virtual ID.
 */
function parseVirtualId(id: string): { parentId: string; dateISO: string } | null {
  const match = id.match(/^(.+)_(\d{4}-\d{2}-\d{2})$/);
  if (!match) return null;
  return { parentId: match[1], dateISO: match[2] };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("PATCH");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { searchParams } = new URL(req.url);
  const editScope = searchParams.get("editScope") || "this";

  const body = await req.json();
  const parsed = updateCalendarEventSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }

  const { date, startTime, endTime, ...rest } = parsed.data;
  const updateData: Record<string, unknown> = { ...rest };
  if (date !== undefined) updateData.date = new Date(date);
  if (startTime !== undefined) updateData.startTime = startTime ? new Date(startTime) : null;
  if (endTime !== undefined) updateData.endTime = endTime ? new Date(endTime) : null;

  // Check if this is a virtual recurring instance
  const virtual = parseVirtualId(params.id);

  if (virtual) {
    // This is a virtual instance — materialize it
    const parent = await prisma.calendarEvent.findFirst({
      where: { id: virtual.parentId, userId },
    });
    if (!parent) return notFound("Recurring parent event not found");

    if (editScope === "all") {
      // Update the parent event
      const event = await prisma.calendarEvent.update({
        where: { id: virtual.parentId },
        data: updateData,
        include: {
          task: { select: { id: true, title: true } },
          project: { select: { id: true, title: true } },
        },
      });
      syncEventToGoogle(virtual.parentId, "update").catch((err) => console.error("[google-calendar] sync failed:", err));
      return NextResponse.json(event);
    }

    // "this" — materialize exception
    const occDate = new Date(virtual.dateISO + "T00:00:00");
    const event = await prisma.calendarEvent.create({
      data: {
        title: (updateData.title as string) || parent.title,
        description: (updateData.description as string | null) ?? parent.description,
        eventType: (updateData.eventType as typeof parent.eventType) || parent.eventType,
        date: (updateData.date as Date) || occDate,
        startTime: updateData.startTime !== undefined ? (updateData.startTime as Date | null) : parent.startTime,
        endTime: updateData.endTime !== undefined ? (updateData.endTime as Date | null) : parent.endTime,
        allDay: (updateData.allDay as boolean | undefined) ?? parent.allDay,
        location: (updateData.location as string | null) ?? parent.location,
        reminderMinutes: (updateData.reminderMinutes as number | null) ?? parent.reminderMinutes,
        recurringEventId: parent.id,
        isRecurringInstance: true,
        userId,
      },
      include: {
        task: { select: { id: true, title: true } },
        project: { select: { id: true, title: true } },
      },
    });

    return NextResponse.json(event, { status: 201 });
  }

  // Regular (non-virtual) event
  const existing = await prisma.calendarEvent.findFirst({
    where: { id: params.id, userId },
  });
  if (!existing) return notFound("Calendar event not found");
  if (existing.syncStatus === "EXTERNAL") {
    return badRequest("External calendar events are read-only");
  }

  if (editScope === "all" && existing.recurringEventId) {
    // Update the parent instead — verify ownership
    const parent = await prisma.calendarEvent.findFirst({
      where: { id: existing.recurringEventId, userId },
    });
    if (!parent) return notFound("Recurring parent event not found");

    const event = await prisma.calendarEvent.update({
      where: { id: existing.recurringEventId },
      data: updateData,
      include: {
        task: { select: { id: true, title: true } },
        project: { select: { id: true, title: true } },
      },
    });
    syncEventToGoogle(existing.recurringEventId, "update").catch((err) => console.error("[google-calendar] sync failed:", err));
    return NextResponse.json(event);
  }

  const event = await prisma.calendarEvent.update({
    where: { id: params.id },
    data: updateData,
    include: {
      task: { select: { id: true, title: true } },
      project: { select: { id: true, title: true } },
    },
  });

  syncEventToGoogle(params.id, "update").catch((err) => console.error("[google-calendar] sync failed:", err));
  return NextResponse.json(event);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("DELETE");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { searchParams } = new URL(req.url);
  const deleteScope = searchParams.get("deleteScope") || "this";

  // Check if this is a virtual recurring instance
  const virtual = parseVirtualId(params.id);

  if (virtual) {
    const parent = await prisma.calendarEvent.findFirst({
      where: { id: virtual.parentId, userId },
    });
    if (!parent) return notFound("Recurring parent event not found");

    if (deleteScope === "all") {
      await syncEventToGoogle(virtual.parentId, "delete").catch((err) => console.error("[google-calendar] sync failed:", err));
      await prisma.calendarEvent.delete({ where: { id: virtual.parentId } });
      return NextResponse.json({ success: true });
    }

    if (deleteScope === "future") {
      // Set UNTIL on the recurrence rule to the day before this instance
      const untilDate = new Date(virtual.dateISO);
      untilDate.setDate(untilDate.getDate() - 1);
      const untilStr = untilDate.toISOString().slice(0, 10).replace(/-/g, "");
      const rule = parent.recurrenceRule || "";
      const newRule = rule.replace(/;?(UNTIL|COUNT)=[^;]*/g, "") + `;UNTIL=${untilStr}T235959Z`;
      // Delete materialized exceptions on or after this date
      await prisma.calendarEvent.deleteMany({
        where: {
          recurringEventId: virtual.parentId,
          userId,
          date: { gte: new Date(virtual.dateISO) },
        },
      });
      await prisma.calendarEvent.update({
        where: { id: virtual.parentId },
        data: { recurrenceRule: newRule },
      });
      await syncEventToGoogle(virtual.parentId, "update").catch((err) => console.error("[google-calendar] sync failed:", err));
      return NextResponse.json({ success: true });
    }

    // "this" — add date to excludedDates
    const excluded = (parent.excludedDates as string[] | null) || [];
    if (excluded.length >= 365) {
      return badRequest("Maximum excluded dates (365) reached. Consider deleting the series.");
    }
    excluded.push(virtual.dateISO);
    await prisma.calendarEvent.update({
      where: { id: virtual.parentId },
      data: { excludedDates: excluded },
    });
    return NextResponse.json({ success: true });
  }

  // Regular event
  const existing = await prisma.calendarEvent.findFirst({
    where: { id: params.id, userId },
  });
  if (!existing) return notFound("Calendar event not found");
  if (existing.syncStatus === "EXTERNAL") {
    return badRequest("External calendar events are read-only");
  }

  if (deleteScope === "all" && existing.recurringEventId) {
    const parent = await prisma.calendarEvent.findFirst({
      where: { id: existing.recurringEventId, userId },
    });
    if (!parent) return notFound("Recurring parent event not found");

    await syncEventToGoogle(existing.recurringEventId, "delete").catch((err) => console.error("[google-calendar] sync failed:", err));
    await prisma.calendarEvent.delete({ where: { id: existing.recurringEventId } });
    return NextResponse.json({ success: true });
  }

  if (deleteScope === "future" && existing.recurringEventId) {
    const parent = await prisma.calendarEvent.findFirst({
      where: { id: existing.recurringEventId, userId },
    });
    if (!parent) return notFound("Recurring parent event not found");

    const eventDate = existing.date.toISOString().slice(0, 10);
    const untilDate = new Date(eventDate);
    untilDate.setDate(untilDate.getDate() - 1);
    const untilStr = untilDate.toISOString().slice(0, 10).replace(/-/g, "");
    const rule = parent.recurrenceRule || "";
    const newRule = rule.replace(/;?(UNTIL|COUNT)=[^;]*/g, "") + `;UNTIL=${untilStr}T235959Z`;
    // Delete this and all future materialized exceptions
    await prisma.calendarEvent.deleteMany({
      where: {
        recurringEventId: existing.recurringEventId,
        userId,
        date: { gte: existing.date },
      },
    });
    await prisma.calendarEvent.update({
      where: { id: existing.recurringEventId },
      data: { recurrenceRule: newRule },
    });
    await syncEventToGoogle(existing.recurringEventId, "update").catch((err) => console.error("[google-calendar] sync failed:", err));
    return NextResponse.json({ success: true });
  }

  if (existing.recurringEventId && deleteScope === "this") {
    // This is a materialized exception — add its date to parent's excludedDates and delete
    const parent = await prisma.calendarEvent.findFirst({
      where: { id: existing.recurringEventId, userId },
    });
    if (parent) {
      const excluded = (parent.excludedDates as string[] | null) || [];
      if (excluded.length < 365) {
        excluded.push(existing.date.toISOString().slice(0, 10));
        await prisma.calendarEvent.update({
          where: { id: existing.recurringEventId },
          data: { excludedDates: excluded },
        });
      }
    }
    await prisma.calendarEvent.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  }

  // Simple non-recurring delete
  await syncEventToGoogle(params.id, "delete").catch((err) => console.error("[google-calendar] sync failed:", err));
  await prisma.calendarEvent.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
