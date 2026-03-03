import { prisma } from "@/lib/prisma";

// ============================================================================
// Schedule Parsing
// ============================================================================

export interface ParsedSchedule {
  type: "daily" | "weekdays" | "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly" | "every_n_days";
  /** Day of week (0=Sun, 6=Sat) for weekly/biweekly */
  dayOfWeek?: number;
  /** Day of month (1-31) for monthly/quarterly/yearly */
  dayOfMonth?: number;
  /** Month (1-12) for yearly */
  month?: number;
  /** Interval in days for every_n_days */
  intervalDays?: number;
}

/**
 * Parse a human-friendly schedule expression into a structured object.
 *
 * Supported formats:
 * - "daily"        -- Every day
 * - "weekdays"     -- Monday through Friday
 * - "weekly:1"     -- Every week on Monday (0=Sun, 6=Sat)
 * - "biweekly:1"   -- Every two weeks on Monday
 * - "monthly:15"   -- Every month on the 15th
 */
export function parseSchedule(cronExpression: string): ParsedSchedule {
  if (cronExpression === "daily") {
    return { type: "daily" };
  }

  if (cronExpression === "weekdays") {
    return { type: "weekdays" };
  }

  if (cronExpression.startsWith("weekly:")) {
    const dayOfWeek = parseInt(cronExpression.split(":")[1], 10);
    if (isNaN(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
      throw new Error(`Invalid weekly day: ${cronExpression}`);
    }
    return { type: "weekly", dayOfWeek };
  }

  if (cronExpression.startsWith("biweekly:")) {
    const dayOfWeek = parseInt(cronExpression.split(":")[1], 10);
    if (isNaN(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
      throw new Error(`Invalid biweekly day: ${cronExpression}`);
    }
    return { type: "biweekly", dayOfWeek };
  }

  if (cronExpression.startsWith("monthly:")) {
    const dayOfMonth = parseInt(cronExpression.split(":")[1], 10);
    if (isNaN(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
      throw new Error(`Invalid monthly day: ${cronExpression}`);
    }
    return { type: "monthly", dayOfMonth };
  }

  if (cronExpression.startsWith("quarterly:")) {
    const dayOfMonth = parseInt(cronExpression.split(":")[1], 10);
    if (isNaN(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
      throw new Error(`Invalid quarterly day: ${cronExpression}`);
    }
    return { type: "quarterly", dayOfMonth };
  }

  if (cronExpression.startsWith("yearly:")) {
    const parts = cronExpression.split(":");
    const month = parseInt(parts[1], 10);
    const dayOfMonth = parseInt(parts[2], 10);
    if (isNaN(month) || month < 1 || month > 12) {
      throw new Error(`Invalid yearly month: ${cronExpression}`);
    }
    if (isNaN(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
      throw new Error(`Invalid yearly day: ${cronExpression}`);
    }
    return { type: "yearly", month, dayOfMonth };
  }

  if (cronExpression.startsWith("every_n_days:")) {
    const intervalDays = parseInt(cronExpression.split(":")[1], 10);
    if (isNaN(intervalDays) || intervalDays < 1 || intervalDays > 999) {
      throw new Error(`Invalid every_n_days interval: ${cronExpression}`);
    }
    return { type: "every_n_days", intervalDays };
  }

  throw new Error(`Unknown schedule expression: ${cronExpression}`);
}

// ============================================================================
// Next Occurrence Calculation
// ============================================================================

/**
 * Calculate the next occurrence of a schedule starting from `fromDate`.
 * Always returns a date strictly after `fromDate`, at midnight UTC of that day.
 */
export function getNextOccurrence(cronExpression: string, fromDate: Date): Date {
  const schedule = parseSchedule(cronExpression);
  const start = new Date(fromDate);

  // Move to the next day to ensure we're always in the future
  const next = new Date(start);
  next.setUTCDate(next.getUTCDate() + 1);
  next.setUTCHours(0, 0, 0, 0);

  switch (schedule.type) {
    case "daily":
      // Already moved to next day
      return next;

    case "weekdays": {
      // Advance until we land on Mon-Fri (1-5)
      while (next.getUTCDay() === 0 || next.getUTCDay() === 6) {
        next.setUTCDate(next.getUTCDate() + 1);
      }
      return next;
    }

    case "weekly": {
      const targetDay = schedule.dayOfWeek!;
      while (next.getUTCDay() !== targetDay) {
        next.setUTCDate(next.getUTCDate() + 1);
      }
      return next;
    }

    case "biweekly": {
      const targetDay = schedule.dayOfWeek!;
      // Find the next occurrence of that day of week
      while (next.getUTCDay() !== targetDay) {
        next.setUTCDate(next.getUTCDate() + 1);
      }
      // For biweekly, use ISO week parity to determine even/odd weeks
      const weekNumber = getISOWeekNumber(next);
      if (weekNumber % 2 !== 0) {
        // If odd week, move to next week (which will be even)
        next.setUTCDate(next.getUTCDate() + 7);
      }
      return next;
    }

    case "monthly": {
      const targetDay = schedule.dayOfMonth!;
      // Try the current month first
      if (next.getUTCDate() <= targetDay) {
        const daysInMonth = getDaysInMonth(next.getUTCFullYear(), next.getUTCMonth());
        const effectiveDay = Math.min(targetDay, daysInMonth);
        next.setUTCDate(effectiveDay);
        return next;
      }
      // Move to next month
      next.setUTCMonth(next.getUTCMonth() + 1);
      next.setUTCDate(1);
      const daysInMonth = getDaysInMonth(next.getUTCFullYear(), next.getUTCMonth());
      const effectiveDay = Math.min(targetDay, daysInMonth);
      next.setUTCDate(effectiveDay);
      return next;
    }

    case "quarterly": {
      const targetDay = schedule.dayOfMonth!;
      // Quarters start at months 0,3,6,9 (Jan,Apr,Jul,Oct)
      const currentMonth = next.getUTCMonth();
      const nextQuarterMonth = Math.ceil((currentMonth + 1) / 3) * 3;
      // If we're still within the current quarter month and before the target day
      const quarterStartMonth = Math.floor(currentMonth / 3) * 3;
      if (currentMonth === quarterStartMonth && next.getUTCDate() <= targetDay) {
        const dim = getDaysInMonth(next.getUTCFullYear(), currentMonth);
        next.setUTCDate(Math.min(targetDay, dim));
        return next;
      }
      // Move to next quarter start
      next.setUTCMonth(nextQuarterMonth);
      next.setUTCDate(1);
      const dim = getDaysInMonth(next.getUTCFullYear(), next.getUTCMonth());
      next.setUTCDate(Math.min(targetDay, dim));
      return next;
    }

    case "yearly": {
      const targetMonth = schedule.month! - 1; // 0-indexed
      const targetDay = schedule.dayOfMonth!;
      const currentYear = next.getUTCFullYear();
      // Try this year
      const candidate = new Date(Date.UTC(currentYear, targetMonth, 1));
      const dim = getDaysInMonth(currentYear, targetMonth);
      candidate.setUTCDate(Math.min(targetDay, dim));
      if (candidate > next) {
        return candidate;
      }
      // Move to next year
      const nextYear = currentYear + 1;
      const dimNext = getDaysInMonth(nextYear, targetMonth);
      return new Date(Date.UTC(nextYear, targetMonth, Math.min(targetDay, dimNext)));
    }

    case "every_n_days": {
      const interval = schedule.intervalDays!;
      // Simply add N days from fromDate
      const result = new Date(start);
      result.setUTCDate(result.getUTCDate() + interval);
      result.setUTCHours(0, 0, 0, 0);
      return result;
    }

    default:
      throw new Error(`Unhandled schedule type`);
  }
}

/**
 * Get ISO week number for biweekly even/odd determination.
 */
function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * Get the number of days in a given month (0-indexed month).
 */
function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

// ============================================================================
// Human-Readable Labels
// ============================================================================

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Convert a schedule expression to a human-readable label.
 */
export function scheduleLabel(cronExpression: string): string {
  const schedule = parseSchedule(cronExpression);

  switch (schedule.type) {
    case "daily":
      return "Every day";
    case "weekdays":
      return "Weekdays (Mon-Fri)";
    case "weekly":
      return `Every ${DAY_NAMES[schedule.dayOfWeek!]}`;
    case "biweekly":
      return `Every other ${DAY_NAMES[schedule.dayOfWeek!]}`;
    case "monthly":
      return `Monthly on the ${ordinal(schedule.dayOfMonth!)}`;
    case "quarterly":
      return `Quarterly on the ${ordinal(schedule.dayOfMonth!)}`;
    case "yearly": {
      const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      return `Yearly on ${MONTH_NAMES[schedule.month! - 1]} ${ordinal(schedule.dayOfMonth!)}`;
    }
    case "every_n_days":
      return `Every ${schedule.intervalDays} day${schedule.intervalDays! !== 1 ? "s" : ""}`;
    default:
      return cronExpression;
  }
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ============================================================================
// Task Generation
// ============================================================================

interface TaskDefaults {
  projectId?: string | null;
  contextId?: string | null;
  energyLevel?: "LOW" | "MEDIUM" | "HIGH" | null;
  estimatedMins?: number | null;
}

interface RecurringTemplateRecord {
  id: string;
  userId: string;
  title: string;
  description?: string | null;
  cronExpression: string;
  taskDefaults?: TaskDefaults | null;
  nextDue?: Date | null;
  isActive: boolean;
  lastGenerated?: Date | null;
}

/**
 * Create a new Task from a RecurringTemplate.
 * Sets scheduledDate (tickler) to the template's nextDue so the task
 * appears on the right day, and links back to the template for recycling.
 */
export async function generateTaskFromTemplate(template: RecurringTemplateRecord) {
  const defaults = (template.taskDefaults ?? {}) as TaskDefaults;

  const task = await prisma.task.create({
    data: {
      title: template.title,
      notes: template.description || null,
      userId: template.userId,
      projectId: defaults.projectId || null,
      contextId: defaults.contextId || null,
      energyLevel: defaults.energyLevel || null,
      estimatedMins: defaults.estimatedMins || null,
      status: "NOT_STARTED",
      scheduledDate: template.nextDue || null,
      recurringTemplateId: template.id,
    },
  });

  return task;
}

/**
 * Recycle a recurring task after completion: find the active template,
 * calculate the next occurrence, generate a new task, and advance the template.
 * Returns info about the recycled task, or null if template is inactive/missing.
 */
export async function recycleRecurringTask(
  recurringTemplateId: string
): Promise<{ id: string; title: string; nextDue: Date } | null> {
  const template = await prisma.recurringTemplate.findUnique({
    where: { id: recurringTemplateId },
  });

  if (!template || !template.isActive) return null;

  // Idempotency: skip if an active task already exists for this template
  const existingActive = await prisma.task.findFirst({
    where: {
      recurringTemplateId: template.id,
      status: { notIn: ["COMPLETED", "DROPPED"] },
    },
  });
  if (existingActive) return null;

  const now = new Date();
  const nextDue = getNextOccurrence(template.cronExpression, now);

  const record: RecurringTemplateRecord = {
    id: template.id,
    userId: template.userId,
    title: template.title,
    description: template.description,
    cronExpression: template.cronExpression,
    taskDefaults: template.taskDefaults as TaskDefaults | null,
    nextDue: nextDue,
    isActive: template.isActive,
    lastGenerated: template.lastGenerated,
  };

  const task = await generateTaskFromTemplate(record);

  await prisma.recurringTemplate.update({
    where: { id: template.id },
    data: {
      lastGenerated: now,
      nextDue,
    },
  });

  return { id: task.id, title: task.title, nextDue };
}

/**
 * Process all active recurring templates for a given user.
 * For each template whose nextDue is in the past (or now), generate a task
 * and advance nextDue to the next occurrence.
 *
 * Returns the number of tasks generated.
 */
export async function processRecurringTemplates(userId: string): Promise<number> {
  const now = new Date();

  const templates = await prisma.recurringTemplate.findMany({
    where: {
      userId,
      isActive: true,
      nextDue: { lte: now },
    },
  });

  let generated = 0;

  for (const template of templates) {
    // Idempotency: skip if an active task already exists for this template
    const existingActive = await prisma.task.findFirst({
      where: {
        recurringTemplateId: template.id,
        status: { notIn: ["COMPLETED", "DROPPED"] },
      },
    });
    if (existingActive) continue;

    const record: RecurringTemplateRecord = {
      id: template.id,
      userId: template.userId,
      title: template.title,
      description: template.description,
      cronExpression: template.cronExpression,
      taskDefaults: template.taskDefaults as TaskDefaults | null,
      nextDue: template.nextDue,
      isActive: template.isActive,
      lastGenerated: template.lastGenerated,
    };

    await generateTaskFromTemplate(record);

    const nextDue = getNextOccurrence(template.cronExpression, now);

    await prisma.recurringTemplate.update({
      where: { id: template.id },
      data: {
        lastGenerated: now,
        nextDue,
      },
    });

    generated++;
  }

  return generated;
}
