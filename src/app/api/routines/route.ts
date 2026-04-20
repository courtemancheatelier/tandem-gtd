import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest } from "@/lib/api/auth-helpers";
import { z } from "zod";
import { getNextOccurrence, generateTaskFromTemplate } from "@/lib/recurring";
import { parseRampSchedule, getDayNumber, resolveDosage } from "@/lib/routine-dosing";

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
  title: z.string().min(1),
  targetTime: z.string().nullable().optional(),
  sortOrder: z.number().int().default(0),
  constraint: z.string().nullable().optional(),
  windowType: z.enum(["health", "chores", "spiritual", "general"]).default("general"),
  items: z.array(z.object({
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

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().nullable().optional(),
  cronExpression: z.string().optional(),
  schedule: z.string().optional(),
  color: z.string().nullable().optional(),
  estimatedMins: z.number().int().nullable().optional(),
  areaId: z.string().nullable().optional(),
  routineType: z.enum(["static", "dynamic", "sleep"]).default("static"),
  startDate: z.string().nullable().optional(),
  totalDays: z.number().int().min(1).nullable().optional(),
  windows: z.array(windowSchema).default([]),
  // Simple routine fields (no windows)
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
  nextDue: z.string().datetime().optional(),
  isActive: z.boolean().optional(),
});

/** GET /api/routines — list all routines for the user */
export async function GET() {
  const auth = await requireAuth("GET");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const routines = await prisma.routine.findMany({
    where: { userId },
    include: {
      windows: {
        orderBy: { sortOrder: "asc" },
        include: {
          items: { orderBy: { sortOrder: "asc" } },
        },
      },
      area: { select: { id: true, name: true } },
      goal: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(routines);
}

/** POST /api/routines — create a new routine (simple or windowed) */
export async function POST(req: NextRequest) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.message);
  const data = parsed.data;

  // Accept `schedule` as alias for `cronExpression`
  const isSleep = data.routineType === "sleep";
  const cronExpression = isSleep ? "daily" : (data.cronExpression || data.schedule || "daily");
  const isSimple = data.windows.length === 0;
  const now = new Date();

  // For static routines, set nextDue to today so the initial task
  // can be generated immediately. For dynamic routines, use the startDate.
  const todayMidnight = new Date(now);
  todayMidnight.setUTCHours(0, 0, 0, 0);

  const nextDue = data.nextDue
    ? new Date(data.nextDue)
    : data.routineType === "dynamic" && data.startDate
      ? new Date(data.startDate)
      : todayMidnight;

  const routine = await prisma.routine.create({
    data: {
      title: data.title,
      description: data.description,
      cronExpression,
      color: data.color,
      estimatedMins: data.estimatedMins,
      areaId: data.areaId,
      routineType: data.routineType,
      startDate: data.startDate ? new Date(data.startDate) : null,
      totalDays: data.totalDays,
      userId,
      nextDue,
      isActive: data.isActive ?? true,
      // Simple routine fields
      targetTime: data.targetTime || null,
      dueByTime: data.dueByTime || null,
      goalId: data.goalId || null,
      taskDefaults: data.taskDefaults ?? undefined,
      // Sleep tracker fields
      targetBedtime: isSleep ? (data.targetBedtime || "23:00") : null,
      targetWakeTime: isSleep ? (data.targetWakeTime || "07:00") : null,
      ...(data.progression ? {
        progressionBaseValue: data.progression.baseValue,
        progressionIncrement: data.progression.increment,
        progressionUnit: data.progression.unit,
        progressionFrequency: data.progression.frequency,
        progressionStartDate: data.progression.startDate ? new Date(data.progression.startDate) : new Date(),
      } : {}),
      windows: {
        create: data.windows.map((w, wi) => ({
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
        })),
      },
    },
    include: {
      windows: {
        orderBy: { sortOrder: "asc" },
        include: { items: { orderBy: { sortOrder: "asc" } } },
      },
      area: { select: { id: true, name: true } },
      goal: { select: { id: true, title: true } },
    },
  });

  // Immediately generate today's task so it appears in Card File right away
  const shouldGenerateToday = nextDue <= now && (data.isActive ?? true);
  if (shouldGenerateToday) {
    if (isSimple) {
      // Simple routine: use generateTaskFromTemplate
      await generateTaskFromTemplate({
        id: routine.id,
        userId,
        title: data.title,
        description: data.description || null,
        cronExpression,
        taskDefaults: data.taskDefaults as Record<string, unknown> | null ?? null,
        nextDue: now,
        isActive: true,
        lastGenerated: null,
        progressionBaseValue: routine.progressionBaseValue,
        progressionIncrement: routine.progressionIncrement,
        progressionUnit: routine.progressionUnit,
        progressionFrequency: routine.progressionFrequency,
        progressionStartDate: routine.progressionStartDate,
      });
    } else {
      // Windowed routine: build notes from windows/items
      const isDynamic = routine.routineType === "dynamic" && routine.startDate;
      const dayNumber = isDynamic
        ? getDayNumber(routine.startDate!, nextDue)
        : null;

      const taskTitle = dayNumber != null && routine.totalDays
        ? `${routine.title} (Day ${dayNumber} of ${routine.totalDays})`
        : routine.title;

      const noteLines: string[] = [];
      for (const w of routine.windows) {
        noteLines.push(`## ${w.title}${w.targetTime ? ` (${w.targetTime})` : ""}`);
        for (const item of w.items) {
          const dosage = dayNumber != null
            ? resolveDosage(item.dosage, item.rampSchedule, dayNumber)
            : item.dosage;
          noteLines.push(`- ${item.name}${dosage ? ` — ${dosage}` : ""}`);
        }
        noteLines.push("");
      }

      await prisma.task.create({
        data: {
          title: taskTitle,
          notes: noteLines.join("\n").trim(),
          userId,
          routineId: routine.id,
          scheduledDate: nextDue,
          estimatedMins: routine.estimatedMins,
          isNextAction: true,
          status: "NOT_STARTED",
        },
      });
    }

    // Advance nextDue to the next occurrence so the cron doesn't double-generate
    const advancedNextDue = getNextOccurrence(routine.cronExpression, now);
    await prisma.routine.update({
      where: { id: routine.id },
      data: { lastGenerated: now, nextDue: advancedNextDue },
    });
  }

  return NextResponse.json(routine, { status: 201 });
}
