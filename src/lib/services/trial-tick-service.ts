import { prisma } from "@/lib/prisma";
import { sendTrialReminderEmail } from "@/lib/email";

export interface TrialTickResult {
  reminders: number;
  errors: number;
}

// Days before expiration at which to send reminders
const REMINDER_DAYS = [7, 3];

/**
 * One pass of trial expiry reminders. Called once per UTC day by the
 * in-process scheduler's daily slot, and also by the legacy
 * `POST /api/cron/trial` route during the transition.
 *
 * Idempotent at the day level via existing-row checks on `notification`.
 *
 * Spec: docs/specs/INTERNAL_SCHEDULER_TRIAL.md
 */
export async function runTrialTick(now: Date): Promise<TrialTickResult> {
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);

  const results: TrialTickResult = {
    reminders: 0,
    errors: 0,
  };

  for (const daysLeft of REMINDER_DAYS) {
    const targetStart = new Date(now);
    targetStart.setDate(targetStart.getDate() + daysLeft);
    targetStart.setUTCHours(0, 0, 0, 0);

    const targetEnd = new Date(targetStart);
    targetEnd.setDate(targetEnd.getDate() + 1);

    const trialUsers = await prisma.user.findMany({
      where: {
        isTrial: true,
        isDisabled: false,
        trialExpiresAt: {
          gte: targetStart,
          lt: targetEnd,
        },
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    for (const user of trialUsers) {
      // Idempotency: one reminder per user per day
      const existing = await prisma.notification.findFirst({
        where: {
          userId: user.id,
          type: "TRIAL_REMINDER",
          createdAt: { gte: startOfDay },
        },
      });
      if (existing) continue;

      let emailSent = false;
      try {
        emailSent = await sendTrialReminderEmail(
          user.email,
          user.name,
          daysLeft
        );
      } catch (err) {
        console.error(`[trial-tick] Failed to email ${user.email}:`, err);
        results.errors++;
      }

      await prisma.notification.create({
        data: {
          userId: user.id,
          type: "TRIAL_REMINDER",
          title: `${daysLeft} day${daysLeft !== 1 ? "s" : ""} left in your trial`,
          body: "Export your data or explore self-hosting options before your trial ends.",
          link: "/trial-ended",
          sentViaEmail: emailSent,
        },
      });

      results.reminders++;
    }
  }

  return results;
}
