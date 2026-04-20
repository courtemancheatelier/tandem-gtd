import { RRule, rrulestr } from "rrule";

/**
 * Expand a recurrence rule into occurrence dates within a date range.
 * Returns an array of Date objects.
 */
export function expandRecurrence(
  rruleString: string,
  dtstart: Date,
  rangeStart: Date,
  rangeEnd: Date,
  excludedDates?: string[] | null
): Date[] {
  const rule = new RRule({
    ...RRule.parseString(rruleString),
    dtstart,
  });

  const occurrences = rule.between(rangeStart, rangeEnd, true);

  if (!excludedDates || excludedDates.length === 0) return occurrences;

  const excludedSet = new Set(excludedDates);
  return occurrences.filter((d) => {
    const dateStr = d.toISOString().slice(0, 10);
    return !excludedSet.has(dateStr);
  });
}

/**
 * Build an RRULE string from structured options.
 */
export function buildRRule(options: {
  frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval?: number;
  byDay?: string[]; // ["MO", "TU", "WE", ...]
  count?: number;
  until?: Date;
}): string {
  const parts: string[] = [`FREQ=${options.frequency}`];

  if (options.interval && options.interval > 1) {
    parts.push(`INTERVAL=${options.interval}`);
  }

  if (options.byDay && options.byDay.length > 0) {
    parts.push(`BYDAY=${options.byDay.join(",")}`);
  }

  if (options.count) {
    parts.push(`COUNT=${options.count}`);
  } else if (options.until) {
    // RRULE expects UNTIL in UTC format: YYYYMMDDTHHMMSSZ
    const u = options.until;
    const untilStr = `${u.getFullYear()}${String(u.getMonth() + 1).padStart(2, "0")}${String(u.getDate()).padStart(2, "0")}T235959Z`;
    parts.push(`UNTIL=${untilStr}`);
  }

  return parts.join(";");
}

/**
 * Parse an RRULE string into a structured object.
 */
export function parseRRule(rruleString: string): {
  frequency: string;
  interval: number;
  byDay: string[];
  count?: number;
  until?: Date;
} {
  const options = RRule.parseString(rruleString);
  const freqMap: Record<number, string> = {
    [RRule.DAILY]: "DAILY",
    [RRule.WEEKLY]: "WEEKLY",
    [RRule.MONTHLY]: "MONTHLY",
    [RRule.YEARLY]: "YEARLY",
  };

  const byDay: string[] = [];
  if (options.byweekday) {
    const dayMap: Record<number, string> = { 0: "MO", 1: "TU", 2: "WE", 3: "TH", 4: "FR", 5: "SA", 6: "SU" };
    const weekdays = Array.isArray(options.byweekday) ? options.byweekday : [options.byweekday];
    for (const wd of weekdays) {
      const n = typeof wd === "number" ? wd : (wd as { weekday: number }).weekday;
      if (dayMap[n]) byDay.push(dayMap[n]);
    }
  }

  return {
    frequency: freqMap[options.freq ?? RRule.WEEKLY] || "WEEKLY",
    interval: options.interval || 1,
    byDay,
    count: options.count ?? undefined,
    until: options.until ?? undefined,
  };
}

/**
 * Generate a human-readable description of an RRULE.
 */
export function describeRRule(rruleString: string): string {
  try {
    const rule = rrulestr(`RRULE:${rruleString}`, { forceset: false });
    return (rule as RRule).toText();
  } catch {
    return rruleString;
  }
}
