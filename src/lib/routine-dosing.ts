/**
 * Resolve dynamic dosage for a routine item based on the current day number.
 *
 * Ramp schedule format (step-based):
 * {
 *   "type": "step",
 *   "steps": [
 *     { "fromDay": 1, "toDay": 2, "dosage": "1 cap" },
 *     { "fromDay": 3, "toDay": 7, "dosage": "2 caps" },
 *     { "fromDay": 8, "toDay": 14, "dosage": "2 caps" }
 *   ]
 * }
 *
 * If no matching step, falls back to the item's static dosage.
 */

export interface RampStep {
  fromDay: number;
  toDay: number;
  dosage: string;
}

export interface RampSchedule {
  type: "step";
  steps: RampStep[];
}

/**
 * Calculate the day number of a dynamic routine for a given date.
 * Day 1 = the startDate itself.
 */
export function getDayNumber(startDate: Date, currentDate: Date): number {
  const start = new Date(startDate);
  start.setUTCHours(0, 0, 0, 0);
  const current = new Date(currentDate);
  current.setUTCHours(0, 0, 0, 0);
  const diffMs = current.getTime() - start.getTime();
  return Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1;
}

/**
 * Resolve the dosage for an item on a given day number.
 * Returns the ramp dosage if a matching step exists, otherwise the static dosage.
 */
export function resolveDosage(
  staticDosage: string | null | undefined,
  rampSchedule: unknown,
  dayNumber: number
): string | null {
  if (!rampSchedule || typeof rampSchedule !== "object") {
    return staticDosage ?? null;
  }

  const schedule = rampSchedule as RampSchedule;
  if (schedule.type !== "step" || !Array.isArray(schedule.steps)) {
    return staticDosage ?? null;
  }

  // Find the matching step for this day
  for (const step of schedule.steps) {
    if (dayNumber >= step.fromDay && dayNumber <= step.toDay) {
      return step.dosage;
    }
  }

  // No matching step — fall back to static dosage
  return staticDosage ?? null;
}

/**
 * Get the previous day's dosage for comparison (change indicator).
 * Returns null if day 1 or no ramp schedule.
 */
export function getPreviousDosage(
  staticDosage: string | null | undefined,
  rampSchedule: unknown,
  dayNumber: number
): string | null {
  if (dayNumber <= 1) return null;
  return resolveDosage(staticDosage, rampSchedule, dayNumber - 1);
}

/**
 * Check if a dynamic routine has completed (dayNumber > totalDays).
 */
export function isRoutineComplete(
  startDate: Date,
  totalDays: number,
  currentDate: Date
): boolean {
  return getDayNumber(startDate, currentDate) > totalDays;
}

/**
 * Parse and validate a ramp schedule from user input.
 */
export function parseRampSchedule(input: unknown): RampSchedule | null {
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;
  if (obj.type !== "step" || !Array.isArray(obj.steps)) return null;

  const steps: RampStep[] = [];
  for (const step of obj.steps) {
    if (
      typeof step === "object" &&
      step !== null &&
      typeof (step as RampStep).fromDay === "number" &&
      typeof (step as RampStep).toDay === "number" &&
      typeof (step as RampStep).dosage === "string" &&
      (step as RampStep).dosage.trim()
    ) {
      steps.push({
        fromDay: (step as RampStep).fromDay,
        toDay: (step as RampStep).toDay,
        dosage: (step as RampStep).dosage.trim(),
      });
    }
  }

  if (steps.length === 0) return null;

  // Sort by fromDay
  steps.sort((a, b) => a.fromDay - b.fromDay);
  return { type: "step", steps };
}
