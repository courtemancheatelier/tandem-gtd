/**
 * Window arithmetic for Commitment Drift dashboard.
 * All windows use ISO weeks (Monday–Sunday).
 */

export type DriftWindow = "this-week" | "last-week" | "this-month" | "ytd";

export interface WindowRange {
  start: Date;
  end: Date;
  /** Prior period for comparison. Null for YTD (no comparison). */
  priorStart: Date | null;
  priorEnd: Date | null;
}

/**
 * Get the Monday 00:00:00 of the ISO week containing `date`.
 */
function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  // getDay: 0=Sun, 1=Mon ... 6=Sat. ISO week starts Monday.
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get the Sunday 23:59:59.999 of the ISO week containing `date`.
 */
function getSunday(date: Date): Date {
  const monday = getMonday(date);
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return sunday;
}

export function computeWindowRange(window: DriftWindow): WindowRange {
  const now = new Date();

  switch (window) {
    case "this-week": {
      const start = getMonday(now);
      const end = getSunday(now);
      // Prior = last week
      const priorStart = new Date(start);
      priorStart.setDate(priorStart.getDate() - 7);
      const priorEnd = new Date(end);
      priorEnd.setDate(priorEnd.getDate() - 7);
      return { start, end, priorStart, priorEnd };
    }

    case "last-week": {
      const thisMonday = getMonday(now);
      const start = new Date(thisMonday);
      start.setDate(start.getDate() - 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      // Prior = week before last
      const priorStart = new Date(start);
      priorStart.setDate(priorStart.getDate() - 7);
      const priorEnd = new Date(end);
      priorEnd.setDate(priorEnd.getDate() - 7);
      return { start, end, priorStart, priorEnd };
    }

    case "this-month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      // Prior = last month
      const priorStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const priorEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { start, end, priorStart, priorEnd };
    }

    case "ytd": {
      const start = new Date(now.getFullYear(), 0, 1);
      const end = now;
      return { start, end, priorStart: null, priorEnd: null };
    }

    default:
      throw new Error(`Unknown window: ${window}`);
  }
}
