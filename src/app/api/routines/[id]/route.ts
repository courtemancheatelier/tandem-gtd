import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, notFound, badRequest } from "@/lib/api/auth-helpers";
import { z } from "zod";
import { parseRampSchedule } from "@/lib/routine-dosing";
import { getNextOccurrence, generateTaskFromTemplate } from "@/lib/recurring";

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

const rampStepSchema = z.object({
  fromDay: z.number().int().min(1),
  toDay: z.number().int().min(1),
  dosage: z.string().min(1),
});

const rampScheduleSchema = z.object({
  type: z.literal("step"),
  steps: z.array(rampStepSchema).min(1),
}).nullable().optional();

const windowSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1),
  targetTime: z.string().nullable().optional(),
  sortOrder: z.number().int().default(0),
  constraint: z.string().nullable().optional(),
  windowType: z.enum(["health", "chores", "spiritual", "general"]).default("general"),
  items: z.array(z.object({
    id: z.string().optional(),
    name: z.string().min(1),
    dosage: z.string().nullable().optional(),
    form: z.string().nullable().optional(),
    sortOrder: z.number().int().default(0),
    notes: z.string().nullable().optional(),
    rampSchedule: rampScheduleSchema,
  })).default([]),
});

const progressionSchema = z.object({
  baseValue: z.number().int().positive(),
  increment: z.number().int().positive(),
  unit: z.string().min(1).max(20),
  frequency: z.enum(["daily", "weekly", "monthly"]),
  startDate: z.string().datetime().optional(),
});

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().nullable().optional(),
  cronExpression: z.string().optional(),
  isActive: z.boolean().optional(),
  color: z.string().nullable().optional(),
  estimatedMins: z.number().int().nullable().optional(),
  areaId: z.string().nullable().optional(),
  routineType: z.enum(["static", "dynamic", "sleep"]).optional(),
  startDate: z.string().nullable().optional(),
  totalDays: z.number().int().min(1).nullable().optional(),
  windows: z.array(windowSchema).optional(),
  // Simple routine fields
  targetTime: z.string().regex(timePattern, "Must be HH:MM format").nullable().optional(),
  dueByTime: z.string().regex(timePattern, "Must be HH:MM format").nullable().optional(),
  // Sleep tracker fields
  targetBedtime: z.string().regex(timePattern, "Must be HH:MM format").nullable().optional(),
  targetWakeTime: z.string().regex(timePattern, "Must be HH:MM format").nullable().optional(),
  goalId: z.string().nullable().optional(),
  progression: progressionSchema.nullable().optional(),
  taskDefaults: z.object({
    projectId: z.string().nullable().optional(),
    contextId: z.string().nullable().optional(),
    energyLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).nullable().optional(),
    estimatedMins: z.number().int().positive().nullable().optional(),
  }).nullable().optional(),
  nextDue: z.string().datetime().nullable().optional(),
});

/** GET /api/routines/:id */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const routine = await prisma.routine.findFirst({
    where: { id: params.id, userId },
    include: {
      windows: {
        orderBy: { sortOrder: "asc" },
        include: { items: { orderBy: { sortOrder: "asc" } } },
      },
      area: { select: { id: true, name: true } },
      goal: { select: { id: true, title: true } },
    },
  });

  if (!routine) return notFound("Routine not found");
  return NextResponse.json(routine);
}

/** PATCH /api/routines/:id */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("PATCH");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const existing = await prisma.routine.findFirst({
    where: { id: params.id, userId },
    include: { _count: { select: { windows: true } } },
  });
  if (!existing) return notFound("Routine not found");

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.message);
  const data = parsed.data;

  // Convert startDate string to Date if provided
  const startDateValue = data.startDate !== undefined
    ? (data.startDate ? new Date(data.startDate) : null)
    : undefined;

  // Build routine-level updates
  const buildRoutineUpdates = () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { windows: _w, startDate: _sd, progression: _p, ...rest } = data;
    const updates: Record<string, unknown> = { ...rest };
    if (startDateValue !== undefined) updates.startDate = startDateValue;

    // Handle progression
    if (data.progression !== undefined) {
      if (data.progression === null) {
        updates.progressionBaseValue = null;
        updates.progressionIncrement = null;
        updates.progressionUnit = null;
        updates.progressionFrequency = null;
        updates.progressionStartDate = null;
      } else {
        updates.progressionBaseValue = data.progression.baseValue;
        updates.progressionIncrement = data.progression.increment;
        updates.progressionUnit = data.progression.unit;
        updates.progressionFrequency = data.progression.frequency;
        updates.progressionStartDate = data.progression.startDate
          ? new Date(data.progression.startDate)
          : existing.progressionStartDate ?? new Date();
      }
    }

    // Recalculate nextDue when schedule changes
    if (data.cronExpression !== undefined) {
      updates.nextDue = getNextOccurrence(data.cronExpression, new Date());
    }
    if (data.nextDue !== undefined) {
      updates.nextDue = data.nextDue ? new Date(data.nextDue) : null;
    }

    return updates;
  };

  if (data.windows) {
    await prisma.$transaction(async (tx) => {
      await tx.routineWindow.deleteMany({ where: { routineId: params.id } });

      for (let wi = 0; wi < data.windows!.length; wi++) {
        const w = data.windows![wi];
        await tx.routineWindow.create({
          data: {
            routineId: params.id,
            title: w.title,
            targetTime: w.targetTime,
            sortOrder: w.sortOrder ?? wi,
            constraint: w.constraint,
            windowType: w.windowType,
            items: {
              create: (w.items || []).map((item, ii) => ({
                name: item.name,
                dosage: item.dosage,
                form: item.form,
                sortOrder: item.sortOrder ?? ii,
                notes: item.notes,
                ...(item.rampSchedule
                  ? { rampSchedule: (parseRampSchedule(item.rampSchedule) as unknown as Prisma.InputJsonValue) ?? Prisma.DbNull }
                  : {}),
              })),
            },
          },
        });
      }

      const updates = buildRoutineUpdates();
      if (Object.keys(updates).length > 0) {
        await tx.routine.update({
          where: { id: params.id },
          data: updates,
        });
      }
    });
  } else {
    const updates = buildRoutineUpdates();
    if (Object.keys(updates).length > 0) {
      await prisma.routine.update({
        where: { id: params.id },
        data: updates,
      });
    }
  }

  // Fetch updated routine for activation/deactivation logic
  const updated = await prisma.routine.findUnique({
    where: { id: params.id },
    include: {
      windows: {
        orderBy: { sortOrder: "asc" },
        include: { items: { orderBy: { sortOrder: "asc" } } },
      },
      area: { select: { id: true, name: true } },
      goal: { select: { id: true, title: true } },
    },
  });

  if (!updated) return notFound("Routine not found");

  const isSimple = updated.windows.length === 0;

  // When deactivating, remove the active task from the card file
  const deactivated = existing.isActive && data.isActive === false;
  if (deactivated) {
    await prisma.task.deleteMany({
      where: {
        routineId: updated.id,
        status: { notIn: ["COMPLETED", "DROPPED"] },
      },
    });
  }

  // When reactivating, generate a task if none exists
  const reactivated = !existing.isActive && data.isActive === true;
  if (reactivated) {
    const hasActiveTask = await prisma.task.findFirst({
      where: {
        routineId: updated.id,
        status: { notIn: ["COMPLETED", "DROPPED"] },
      },
    });

    if (!hasActiveTask) {
      const now = new Date();

      if (isSimple) {
        await generateTaskFromTemplate({
          id: updated.id,
          userId,
          title: updated.title,
          description: updated.description,
          cronExpression: updated.cronExpression,
          taskDefaults: updated.taskDefaults as Record<string, unknown> | null,
          nextDue: now,
          isActive: true,
          lastGenerated: updated.lastGenerated,
          progressionBaseValue: updated.progressionBaseValue,
          progressionIncrement: updated.progressionIncrement,
          progressionUnit: updated.progressionUnit,
          progressionFrequency: updated.progressionFrequency,
          progressionStartDate: updated.progressionStartDate,
        });
      } else {
        // Windowed routine: create task with window notes
        const noteLines: string[] = [];
        for (const w of updated.windows) {
          noteLines.push(`## ${w.title}${w.targetTime ? ` (${w.targetTime})` : ""}`);
          for (const item of w.items) {
            noteLines.push(`- ${item.name}${item.dosage ? ` — ${item.dosage}` : ""}`);
          }
          noteLines.push("");
        }

        await prisma.task.create({
          data: {
            title: updated.title,
            notes: noteLines.join("\n").trim(),
            userId,
            routineId: updated.id,
            scheduledDate: now,
            estimatedMins: updated.estimatedMins,
            isNextAction: true,
            status: "NOT_STARTED",
          },
        });
      }

      await prisma.routine.update({
        where: { id: updated.id },
        data: {
          lastGenerated: now,
          nextDue: getNextOccurrence(updated.cronExpression, now),
        },
      });
    }
  }

  return NextResponse.json(updated);
}

/** DELETE /api/routines/:id */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth("DELETE");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const existing = await prisma.routine.findFirst({
    where: { id: params.id, userId },
  });
  if (!existing) return notFound("Routine not found");

  await prisma.routine.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
