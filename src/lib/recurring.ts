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

  // Standard cron format: "min hour dom month dow"
  // e.g. "0 0 * * 6" = every Saturday
  const cronParts = cronExpression.trim().split(/\s+/);
  if (cronParts.length === 5) {
    const [, , dom, , dow] = cronParts;

    // Weekly: "* * * * N" or "0 0 * * N" where dom=* and dow is a single digit
    if (dom === "*" && /^[0-6]$/.test(dow)) {
      return { type: "weekly", dayOfWeek: parseInt(dow, 10) };
    }

    // Monthly: "0 0 N * *" where dom is a number and dow=*
    if (dow === "*" && /^\d{1,2}$/.test(dom)) {
      const dayOfMonth = parseInt(dom, 10);
      if (dayOfMonth >= 1 && dayOfMonth <= 31) {
        return { type: "monthly", dayOfMonth };
      }
    }

    // Daily: "0 0 * * *" where both dom and dow are wildcards
    if (dom === "*" && dow === "*") {
      return { type: "daily" };
    }

    // Weekdays: "0 0 * * 1-5"
    if (dom === "*" && dow === "1-5") {
      return { type: "weekdays" };
    }
  }

  throw new Error(`Unknown schedule expression: ${cronExpression}`);
}

// ============================================================================
// Next Occurrence Calculation
// ============================================================================

/**
 * Get the local date components for a given Date in a timezone.
 * Returns { year, month (0-indexed), day }.
 */
export function getLocalDateParts(date: Date, timezone: string): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const parts = formatter.formatToParts(date);
  return {
    year: parseInt(parts.find((p) => p.type === "year")!.value),
    month: parseInt(parts.find((p) => p.type === "month")!.value) - 1, // 0-indexed
    day: parseInt(parts.find((p) => p.type === "day")!.value),
  };
}

/**
 * Calculate the next occurrence of a schedule starting from `fromDate`.
 * Always returns a date strictly after `fromDate`'s calendar day, at midnight UTC.
 *
 * When `timezone` is provided, "today" is determined by the user's local date
 * rather than UTC — preventing day-skip bugs when the user is past midnight UTC
 * but still in the same local day.
 */
export function getNextOccurrence(cronExpression: string, fromDate: Date, timezone?: string): Date {
  const schedule = parseSchedule(cronExpression);

  // Determine the user's "current day" — either local or UTC
  let todayYear: number, todayMonth: number, todayDay: number;
  if (timezone) {
    const local = getLocalDateParts(fromDate, timezone);
    todayYear = local.year;
    todayMonth = local.month;
    todayDay = local.day;
  } else {
    todayYear = fromDate.getUTCFullYear();
    todayMonth = fromDate.getUTCMonth();
    todayDay = fromDate.getUTCDate();
  }

  // Start from noon UTC of "today" (the user's local date), then advance to next day.
  // Noon UTC avoids date-boundary shifts when converting to any timezone (UTC−12 to UTC+12).
  const next = new Date(Date.UTC(todayYear, todayMonth, todayDay, 12, 0, 0));
  next.setUTCDate(next.getUTCDate() + 1);

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
      const candidate = new Date(Date.UTC(currentYear, targetMonth, 1, 12, 0, 0));
      const dim = getDaysInMonth(currentYear, targetMonth);
      candidate.setUTCDate(Math.min(targetDay, dim));
      if (candidate > next) {
        return candidate;
      }
      // Move to next year
      const nextYear = currentYear + 1;
      const dimNext = getDaysInMonth(nextYear, targetMonth);
      return new Date(Date.UTC(nextYear, targetMonth, Math.min(targetDay, dimNext), 12, 0, 0));
    }

    case "every_n_days": {
      const interval = schedule.intervalDays!;
      // Add N days from the user's local date
      const result = new Date(Date.UTC(todayYear, todayMonth, todayDay, 12, 0, 0));
      result.setUTCDate(result.getUTCDate() + interval);
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
  let schedule: ParsedSchedule;
  try {
    schedule = parseSchedule(cronExpression);
  } catch {
    return cronExpression;
  }

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
// Progressive Difficulty
// ============================================================================

interface ProgressionConfig {
  baseValue: number;
  increment: number;
  unit: string;
  frequency: string; // "daily" | "weekly" | "monthly"
  startDate: Date;
}

/**
 * Calculate the current progression target value.
 * Returns the base value plus (increment × elapsed periods).
 */
export function getProgressionValue(config: ProgressionConfig, asOfDate?: Date): number {
  const now = asOfDate ?? new Date();
  const start = new Date(config.startDate);
  const msElapsed = now.getTime() - start.getTime();
  if (msElapsed <= 0) return config.baseValue;

  const dayMs = 86400000;
  let periods: number;

  switch (config.frequency) {
    case "daily":
      periods = Math.floor(msElapsed / dayMs);
      break;
    case "weekly":
      periods = Math.floor(msElapsed / (dayMs * 7));
      break;
    case "monthly":
      periods =
        (now.getUTCFullYear() - start.getUTCFullYear()) * 12 +
        (now.getUTCMonth() - start.getUTCMonth());
      break;
    default:
      periods = 0;
  }

  return config.baseValue + config.increment * Math.max(0, periods);
}

/**
 * Format progression for display: "10 min (+1/week)"
 */
export function formatProgression(
  currentValue: number,
  increment: number,
  unit: string,
  frequency: string
): string {
  const freqLabel = frequency === "daily" ? "day" : frequency === "weekly" ? "week" : "month";
  return `${currentValue} ${unit} (+${increment}/${freqLabel})`;
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

interface SimpleRoutineRecord {
  id: string;
  userId: string;
  title: string;
  description?: string | null;
  cronExpression: string;
  taskDefaults?: TaskDefaults | null;
  nextDue?: Date | null;
  isActive: boolean;
  lastGenerated?: Date | null;
  progressionBaseValue?: number | null;
  progressionIncrement?: number | null;
  progressionUnit?: string | null;
  progressionFrequency?: string | null;
  progressionStartDate?: Date | null;
}

/**
 * Create a new Task from a simple Routine (no windows).
 * Sets scheduledDate (tickler) to the routine's nextDue so the task
 * appears on the right day, and links back to the routine for recycling.
 */
export async function generateTaskFromTemplate(template: SimpleRoutineRecord) {
  const defaults = (template.taskDefaults ?? {}) as TaskDefaults;

  // Append progression target to title if configured
  let title = template.title;
  if (
    template.progressionBaseValue != null &&
    template.progressionIncrement != null &&
    template.progressionUnit &&
    template.progressionFrequency &&
    template.progressionStartDate
  ) {
    const currentValue = getProgressionValue({
      baseValue: template.progressionBaseValue,
      increment: template.progressionIncrement,
      unit: template.progressionUnit,
      frequency: template.progressionFrequency,
      startDate: template.progressionStartDate,
    }, template.nextDue ?? undefined);
    title = `${template.title} ${currentValue}${template.progressionUnit}`;
  }

  const task = await prisma.task.create({
    data: {
      title,
      notes: template.description || null,
      userId: template.userId,
      projectId: defaults.projectId || null,
      contextId: defaults.contextId || null,
      energyLevel: defaults.energyLevel || null,
      estimatedMins: defaults.estimatedMins || null,
      status: "NOT_STARTED",
      isNextAction: true,
      scheduledDate: template.nextDue || null,
      routineId: template.id,
    },
  });

  return task;
}

/**
 * Recycle a recurring task after completion: find the active routine,
 * calculate the next occurrence, generate a new task, and advance the routine.
 * Returns info about the recycled task, or null if routine is inactive/missing.
 */
export async function recycleRecurringTask(
  routineId: string,
  /** When recycling from an overdue task, pass its scheduledDate so the next
   *  occurrence is calculated relative to the original date, not wall-clock now.
   *  This prevents skipping/completing an overdue card after midnight from
   *  jumping over today's occurrence. */
  fromDate?: Date | null
): Promise<{ id: string; title: string; nextDue: Date } | null> {
  const routine = await prisma.routine.findUnique({
    where: { id: routineId },
  });

  if (!routine || !routine.isActive) return null;

  // Idempotency: skip if an active task already exists for this routine
  const existingActive = await prisma.task.findFirst({
    where: {
      routineId: routine.id,
      status: { notIn: ["COMPLETED", "DROPPED"] },
    },
  });
  if (existingActive) return null;

  // Get user's timezone to calculate correct "next day"
  const prefs = await prisma.notificationPreference.findUnique({
    where: { userId: routine.userId },
    select: { timezone: true },
  });
  const timezone = prefs?.timezone || "America/New_York";

  const now = new Date();

  // Use fromDate only when the task was truly overdue (scheduled on a previous local day).
  // For tasks scheduled today, always use `now` so daily tasks advance to tomorrow.
  // Normalize fromDate to noon UTC so timezone conversion doesn't shift the calendar date
  // (midnight UTC = previous evening in US timezones).
  let baseDate = now;
  if (fromDate && fromDate < now) {
    const normalizedFrom = new Date(fromDate);
    normalizedFrom.setUTCHours(12, 0, 0, 0);
    const fromLocal = getLocalDateParts(normalizedFrom, timezone);
    const nowLocal = getLocalDateParts(now, timezone);
    const fromIsEarlierDay =
      fromLocal.year < nowLocal.year ||
      fromLocal.month < nowLocal.month ||
      fromLocal.day < nowLocal.day;
    if (fromIsEarlierDay) {
      baseDate = normalizedFrom;
    }
  }
  const nextDue = getNextOccurrence(routine.cronExpression, baseDate, timezone);

  // Prevent duplicate generation: skip if an active task already exists for the next scheduled date
  const nextDueStart = new Date(nextDue);
  nextDueStart.setUTCHours(0, 0, 0, 0);
  const nextDueEnd = new Date(nextDueStart);
  nextDueEnd.setUTCDate(nextDueEnd.getUTCDate() + 1);
  const existingForDate = await prisma.task.findFirst({
    where: {
      routineId: routine.id,
      scheduledDate: { gte: nextDueStart, lt: nextDueEnd },
      status: { notIn: ["COMPLETED", "DROPPED"] },
    },
  });
  if (existingForDate) return null;

  const record: SimpleRoutineRecord = {
    id: routine.id,
    userId: routine.userId,
    title: routine.title,
    description: routine.description,
    cronExpression: routine.cronExpression,
    taskDefaults: routine.taskDefaults as TaskDefaults | null,
    nextDue: nextDue,
    isActive: routine.isActive,
    lastGenerated: routine.lastGenerated,
    progressionBaseValue: routine.progressionBaseValue,
    progressionIncrement: routine.progressionIncrement,
    progressionUnit: routine.progressionUnit,
    progressionFrequency: routine.progressionFrequency,
    progressionStartDate: routine.progressionStartDate,
  };

  const task = await generateTaskFromTemplate(record);

  await prisma.routine.update({
    where: { id: routine.id },
    data: {
      lastGenerated: now,
      nextDue,
    },
  });

  return { id: task.id, title: task.title, nextDue };
}

/**
 * Process all active simple routines (no windows) for a given user.
 * For each routine whose nextDue is in the past (or now), generate a task
 * and advance nextDue to the next occurrence.
 *
 * Returns the number of tasks generated.
 */
export async function processRecurringTemplates(userId: string): Promise<number> {
  const now = new Date();

  // Get user's timezone for correct day boundary calculation
  const prefs = await prisma.notificationPreference.findUnique({
    where: { userId },
    select: { timezone: true },
  });
  const timezone = prefs?.timezone || "America/New_York";

  // Query simple routines (no windows) — these are the migrated recurring templates
  const routines = await prisma.routine.findMany({
    where: {
      userId,
      isActive: true,
      nextDue: { lte: now },
      windows: { none: {} },
    },
  });

  let generated = 0;

  for (const routine of routines) {
    // Idempotency: skip if an active task already exists for this routine
    const existingActive = await prisma.task.findFirst({
      where: {
        routineId: routine.id,
        status: { notIn: ["COMPLETED", "DROPPED"] },
      },
    });
    if (existingActive) continue;

    // Prevent duplicates: if a task already exists for the scheduled date,
    // skip generation but still advance nextDue
    if (routine.nextDue) {
      const scheduledStart = new Date(routine.nextDue);
      scheduledStart.setUTCHours(0, 0, 0, 0);
      const scheduledEnd = new Date(scheduledStart);
      scheduledEnd.setUTCDate(scheduledEnd.getUTCDate() + 1);
      const existingForDate = await prisma.task.findFirst({
        where: {
          routineId: routine.id,
          scheduledDate: { gte: scheduledStart, lt: scheduledEnd },
        },
      });
      if (existingForDate) {
        const nextDue = getNextOccurrence(routine.cronExpression, now, timezone);
        await prisma.routine.update({
          where: { id: routine.id },
          data: { nextDue },
        });
        continue;
      }
    }

    const record: SimpleRoutineRecord = {
      id: routine.id,
      userId: routine.userId,
      title: routine.title,
      description: routine.description,
      cronExpression: routine.cronExpression,
      taskDefaults: routine.taskDefaults as TaskDefaults | null,
      nextDue: routine.nextDue,
      isActive: routine.isActive,
      lastGenerated: routine.lastGenerated,
      progressionBaseValue: routine.progressionBaseValue,
      progressionIncrement: routine.progressionIncrement,
      progressionUnit: routine.progressionUnit,
      progressionFrequency: routine.progressionFrequency,
      progressionStartDate: routine.progressionStartDate,
    };

    await generateTaskFromTemplate(record);

    const nextDue = getNextOccurrence(routine.cronExpression, now, timezone);

    await prisma.routine.update({
      where: { id: routine.id },
      data: {
        lastGenerated: now,
        nextDue,
      },
    });

    generated++;
  }

  return generated;
}
