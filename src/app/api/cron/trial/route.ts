import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTrialReminderEmail } from "@/lib/email";

const CRON_SECRET = process.env.CRON_SECRET;

// Days before expiration at which to send reminders
const REMINDER_DAYS = [7, 3];

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);

  const results = {
    reminders: 0,
    errors: 0,
  };

  for (const daysLeft of REMINDER_DAYS) {
    // Find trial users whose trial expires in exactly `daysLeft` days (within the day)
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

      // Send email
      let emailSent = false;
      try {
        emailSent = await sendTrialReminderEmail(
          user.email,
          user.name,
          daysLeft
        );
      } catch (err) {
        console.error(`[trial-cron] Failed to email ${user.email}:`, err);
        results.errors++;
      }

      // Create in-app notification
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

  return NextResponse.json(results);
}
