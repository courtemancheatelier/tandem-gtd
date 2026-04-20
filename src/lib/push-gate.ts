import { prisma } from "@/lib/prisma";

export function getCurrentHourInTimezone(date: Date, timezone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: timezone,
    });
    return parseInt(formatter.format(date), 10);
  } catch {
    // Invalid timezone — fall back to UTC
    return date.getUTCHours();
  }
}

export function isInQuietHours(currentHour: number, start: number, end: number): boolean {
  if (start <= end) {
    return currentHour >= start && currentHour < end;
  }
  // Wraps midnight (e.g., 22:00 - 07:00)
  return currentHour >= start || currentHour < end;
}

export async function canPushToUser(
  userId: string,
  category: "decisions" | "threads"
): Promise<boolean> {
  const prefs = await prisma.notificationPreference.findUnique({
    where: { userId },
  });
  if (!prefs) return false;
  if (!prefs.pushEnabled) return false;

  // Category-specific toggle
  if (category === "decisions" && !prefs.pushDecisions) return false;

  // Quiet hours check
  if (prefs.quietHoursStart != null && prefs.quietHoursEnd != null) {
    const currentHour = getCurrentHourInTimezone(new Date(), prefs.timezone);
    if (isInQuietHours(currentHour, prefs.quietHoursStart, prefs.quietHoursEnd)) {
      return false;
    }
  }

  // Has at least one push subscription
  const subCount = await prisma.pushSubscription.count({
    where: { userId },
  });
  return subCount > 0;
}
