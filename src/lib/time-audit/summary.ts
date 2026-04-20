import { QUICK_TAG_MAP, INTERVAL_MINUTES, type TagCategory } from "./constants";

interface EntryForSummary {
  intervalStart: Date;
  intervalEnd: Date;
  tags: string[];
  note: string | null;
  taskId: string | null;
}

interface ChallengeForSummary {
  startTime: Date;
  endTime: Date;
  totalPaused: number;
}

export interface TagDistribution {
  tag: string;
  emoji: string;
  label: string;
  category: TagCategory;
  intervals: number;
  minutes: number;
  percentage: number;
}

export interface AlignmentScore {
  /** Task-linked intervals / total intervals */
  raw: number;
  /** Task-linked intervals / (total - maintenance) intervals */
  adjusted: number;
  taskLinkedIntervals: number;
  totalIntervals: number;
  maintenanceIntervals: number;
}

export interface EnergyMapBucket {
  hour: number;
  label: string;
  categories: Record<TagCategory, number>;
}

export interface Observation {
  type: "focus_block" | "most_common" | "scrolling" | "unlinked_thinking";
  text: string;
}

export interface TimeAuditSummary {
  totalIntervals: number;
  loggedIntervals: number;
  totalMinutes: number;
  loggedMinutes: number;
  completionPercent: number;
  tagDistribution: TagDistribution[];
  alignment: AlignmentScore;
  energyMap: EnergyMapBucket[];
  observations: Observation[];
  generatedAt: string;
}

export function generateSummary(
  challenge: ChallengeForSummary,
  entries: EntryForSummary[]
): TimeAuditSummary {
  const totalMs =
    challenge.endTime.getTime() -
    challenge.startTime.getTime() -
    challenge.totalPaused * 60_000;
  const totalIntervals = Math.floor(totalMs / (INTERVAL_MINUTES * 60_000));
  const loggedIntervals = entries.length;
  const totalMinutes = totalIntervals * INTERVAL_MINUTES;
  const loggedMinutes = loggedIntervals * INTERVAL_MINUTES;
  const completionPercent =
    totalIntervals > 0
      ? Math.round((loggedIntervals / totalIntervals) * 100)
      : 0;

  // Tag distribution
  const tagCounts = new Map<string, number>();
  for (const entry of entries) {
    for (const tag of entry.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }

  const tagDistribution: TagDistribution[] = Array.from(tagCounts.entries())
    .map(([tag, intervals]) => {
      const info = QUICK_TAG_MAP.get(tag);
      return {
        tag,
        emoji: info?.emoji ?? "",
        label: info?.label ?? tag,
        category: (info?.category ?? "untracked") as TagCategory,
        intervals,
        minutes: intervals * INTERVAL_MINUTES,
        percentage:
          loggedIntervals > 0
            ? Math.round((intervals / loggedIntervals) * 100)
            : 0,
      };
    })
    .sort((a, b) => b.intervals - a.intervals);

  // Alignment score
  const taskLinkedIntervals = entries.filter((e) => e.taskId).length;
  const maintenanceIntervals = entries.filter((e) =>
    e.tags.some((t) => QUICK_TAG_MAP.get(t)?.category === "maintenance")
  ).length;

  const raw =
    loggedIntervals > 0 ? taskLinkedIntervals / loggedIntervals : 0;
  const adjustedDenom = loggedIntervals - maintenanceIntervals;
  const adjusted =
    adjustedDenom > 0 ? taskLinkedIntervals / adjustedDenom : 0;

  const alignment: AlignmentScore = {
    raw: Math.round(raw * 100),
    adjusted: Math.round(adjusted * 100),
    taskLinkedIntervals,
    totalIntervals: loggedIntervals,
    maintenanceIntervals,
  };

  // Energy map — group by hour
  const hourBuckets = new Map<number, Record<TagCategory, number>>();
  for (const entry of entries) {
    const hour = entry.intervalStart.getHours();
    if (!hourBuckets.has(hour)) {
      hourBuckets.set(hour, {
        productive: 0,
        reactive: 0,
        maintenance: 0,
        untracked: 0,
      });
    }
    const bucket = hourBuckets.get(hour)!;
    for (const tag of entry.tags) {
      const cat = QUICK_TAG_MAP.get(tag)?.category ?? "untracked";
      bucket[cat]++;
    }
  }

  const energyMap: EnergyMapBucket[] = Array.from(hourBuckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([hour, categories]) => ({
      hour,
      label: `${hour % 12 || 12}${hour < 12 ? "AM" : "PM"}`,
      categories,
    }));

  // Observations
  const observations: Observation[] = [];

  // Longest focus block (consecutive task_work entries)
  let maxFocus = 0;
  let currentFocus = 0;
  let focusStart: Date | null = null;
  let bestFocusStart: Date | null = null;
  const sorted = [...entries].sort(
    (a, b) => a.intervalStart.getTime() - b.intervalStart.getTime()
  );
  for (const entry of sorted) {
    if (entry.tags.includes("task_work")) {
      if (currentFocus === 0) focusStart = entry.intervalStart;
      currentFocus++;
      if (currentFocus > maxFocus) {
        maxFocus = currentFocus;
        bestFocusStart = focusStart;
      }
    } else {
      currentFocus = 0;
    }
  }
  if (maxFocus > 0 && bestFocusStart) {
    const mins = maxFocus * INTERVAL_MINUTES;
    const h = bestFocusStart.getHours();
    const m = bestFocusStart.getMinutes();
    const timeStr = `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
    observations.push({
      type: "focus_block",
      text: `Your longest uninterrupted focus block was ${mins} minutes starting at ${timeStr}.`,
    });
  }

  // Most common tag
  if (tagDistribution.length > 0) {
    const top = tagDistribution[0];
    observations.push({
      type: "most_common",
      text: `${top.emoji} ${top.label} was your most logged activity at ${top.percentage}% of intervals.`,
    });
  }

  // Scrolling patterns
  const scrollEntries = entries.filter((e) =>
    e.tags.includes("phone_scroll")
  );
  if (scrollEntries.length >= 3) {
    const scrollMins = scrollEntries.length * INTERVAL_MINUTES;
    observations.push({
      type: "scrolling",
      text: `You had ${scrollMins} minutes of phone/scrolling spread across ${scrollEntries.length} intervals.`,
    });
  }

  // Unlinked thinking time
  const thinkingNoTask = entries.filter(
    (e) => e.tags.includes("thinking") && !e.taskId
  );
  if (thinkingNoTask.length > 0) {
    const mins = thinkingNoTask.length * INTERVAL_MINUTES;
    observations.push({
      type: "unlinked_thinking",
      text: `${mins} minutes were logged as "thinking" with no task link \u2014 these might be planning time worth capturing.`,
    });
  }

  return {
    totalIntervals,
    loggedIntervals,
    totalMinutes,
    loggedMinutes,
    completionPercent,
    tagDistribution,
    alignment,
    energyMap,
    observations,
    generatedAt: new Date().toISOString(),
  };
}
