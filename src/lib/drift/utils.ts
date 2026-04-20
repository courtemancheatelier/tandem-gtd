/**
 * Commitment Drift utility functions.
 * Used by task-service counters and the backfill script.
 */

/**
 * Returns true if a date change represents a forward shift (postponement).
 */
export function isForwardShift(change: { old: unknown; new: unknown }): boolean {
  if (!change.old || !change.new) return false;
  const oldDate = new Date(change.old as string);
  const newDate = new Date(change.new as string);
  if (isNaN(oldDate.getTime()) || isNaN(newDate.getTime())) return false;
  return newDate > oldDate;
}

/**
 * Compute the number of calendar days between two dates.
 * Returns 0 if either date is missing or invalid.
 */
export function computeDriftDays(
  originalDate: Date | string | null | undefined,
  currentDate: Date | string | null | undefined
): number {
  if (!originalDate || !currentDate) return 0;
  const orig = new Date(originalDate);
  const curr = new Date(currentDate);
  if (isNaN(orig.getTime()) || isNaN(curr.getTime())) return 0;
  const diffMs = curr.getTime() - orig.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}
