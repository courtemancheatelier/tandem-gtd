import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";
import { sendDailyDigestEmail } from "@/lib/email";
import { getCurrentHourInTimezone, isInQuietHours } from "@/lib/push-gate";

export interface NotificationTickResult {
  dueTodayNotifications: number;
  overdueNotifications: number;
  dueTomorrowNotifications: number;
  reviewNudges: number;
  dailyDigests: number;
  decisionDeadlineReminders: number;
  decisionExpired: number;
}

/**
 * One pass of notification dispatch. Called every 15 minutes by the
 * in-process scheduler (`src/lib/scheduler/notification-scheduler.ts`)
 * and also by the legacy `POST /api/cron/notifications` route during
 * the transition.
 *
 * Pure function of (now, DB state). All idempotency lives in helpers
 * below via existing-row checks on `notification`.
 *
 * Spec: docs/specs/INTERNAL_SCHEDULER_NOTIFICATIONS.md
 */
export async function runNotificationTick(now: Date): Promise<NotificationTickResult> {
  const results: NotificationTickResult = {
    dueTodayNotifications: 0,
    overdueNotifications: 0,
    dueTomorrowNotifications: 0,
    reviewNudges: 0,
    dailyDigests: 0,
    decisionDeadlineReminders: 0,
    decisionExpired: 0,
  };

  // --- Decision Expiry (runs once, not per-user) ---
  results.decisionExpired = await processDecisionExpiry(now);

  // Get all active users (in-app notifications always created; push sent if subscriptions exist)
  const users = await prisma.user.findMany({
    where: {
      isDisabled: false,
    },
    select: {
      id: true,
      email: true,
      notificationPreference: true,
      _count: { select: { pushSubscriptions: true } },
    },
  });

  for (const user of users) {
    // Upsert default preferences if none exist
    const prefs = user.notificationPreference ?? await prisma.notificationPreference.create({
      data: { userId: user.id },
    });

    const hasPush = prefs.pushEnabled && user._count.pushSubscriptions > 0;

    // Check quiet hours (only skip push; in-app notifications are always created)
    let inQuietHours = false;
    const currentHour = getCurrentHourInTimezone(now, prefs.timezone);
    if (prefs.quietHoursStart != null && prefs.quietHoursEnd != null) {
      inQuietHours = isInQuietHours(currentHour, prefs.quietHoursStart, prefs.quietHoursEnd);
    }
    const canPush = hasPush && !inQuietHours;

    // --- Daily Digest ---
    // Check if it's the user's reminder time hour for digest delivery
    const digestActive = prefs.pushDailyDigest || (prefs.emailEnabled && prefs.emailDailyDigest);
    let digestSentThisRun = false;
    if (digestActive && currentHour === prefs.reminderTimeHour) {
      const digestResult = await processDailyDigest(user.id, user.email, now, prefs, canPush);
      results.dailyDigests += digestResult;
      digestSentThisRun = digestResult > 0;
    }

    // When daily digest push is active, skip push on individual task notifications
    // (still create in-app records)
    const canPushIndividual = canPush && !(prefs.pushDailyDigest && digestSentThisRun);

    // --- Due Today ---
    if (prefs.pushDueToday) {
      results.dueTodayNotifications += await processDueTodayNotifications(user.id, now, canPushIndividual);
    }

    // --- Overdue ---
    if (prefs.pushOverdue) {
      results.overdueNotifications += await processOverdueNotifications(user.id, now, canPushIndividual);
    }

    // --- Due Tomorrow ---
    if (prefs.pushDueTomorrow) {
      results.dueTomorrowNotifications += await processDueTomorrowNotifications(user.id, now, canPushIndividual);
    }

    // --- Weekly Review Nudge ---
    if (prefs.pushWeeklyReview && now.getUTCDay() === prefs.weeklyReviewDay) {
      results.reviewNudges += await processWeeklyReviewNudge(user.id, now, canPush);
    }

    // --- Decision Deadline Reminders ---
    if (prefs.pushDecisions) {
      const canPushDecisions = canPush && prefs.pushDecisions;
      results.decisionDeadlineReminders += await processDecisionDeadlineReminders(user.id, now, canPushDecisions);
    }
  }

  return results;
}

async function processDueTodayNotifications(userId: string, now: Date, canPush: boolean): Promise<number> {
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);

  const dueTasks = await prisma.task.findMany({
    where: {
      userId,
      dueDate: { gte: startOfDay, lt: endOfDay },
      status: { notIn: ["COMPLETED", "DROPPED"] },
    },
  });

  let created = 0;
  for (const task of dueTasks) {
    const existing = await prisma.notification.findFirst({
      where: {
        userId,
        taskId: task.id,
        type: "TASK_DUE_TODAY",
        createdAt: { gte: startOfDay },
      },
    });
    if (existing) continue;

    let pushSent = false;
    if (canPush) {
      const pushed = await sendPushToUser(userId, {
        title: "Task due today",
        body: task.title,
        url: "/do-now",
        tag: `due-today-${task.id}`,
      });
      pushSent = pushed > 0;
    }

    await prisma.notification.create({
      data: {
        userId,
        taskId: task.id,
        type: "TASK_DUE_TODAY",
        title: "Task due today",
        body: task.title,
        link: "/do-now",
        sentViaPush: pushSent,
      },
    });

    created++;
  }

  return created;
}

async function processOverdueNotifications(userId: string, now: Date, canPush: boolean): Promise<number> {
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);

  const overdueTasks = await prisma.task.findMany({
    where: {
      userId,
      dueDate: { lt: startOfDay },
      status: { notIn: ["COMPLETED", "DROPPED"] },
    },
  });

  let created = 0;
  for (const task of overdueTasks) {
    const existing = await prisma.notification.findFirst({
      where: {
        userId,
        taskId: task.id,
        type: "TASK_OVERDUE",
        createdAt: { gte: startOfDay },
      },
    });
    if (existing) continue;

    const daysOverdue = Math.floor(
      (startOfDay.getTime() - task.dueDate!.getTime()) / 86400000
    );

    let pushSent = false;
    if (canPush) {
      const pushed = await sendPushToUser(userId, {
        title: `Task overdue (${daysOverdue}d)`,
        body: task.title,
        url: "/do-now",
        tag: `overdue-${task.id}`,
        renotify: true,
      });
      pushSent = pushed > 0;
    }

    await prisma.notification.create({
      data: {
        userId,
        taskId: task.id,
        type: "TASK_OVERDUE",
        title: `Task overdue (${daysOverdue} day${daysOverdue === 1 ? "" : "s"})`,
        body: task.title,
        link: "/do-now",
        sentViaPush: pushSent,
      },
    });

    created++;
  }

  return created;
}

async function processDueTomorrowNotifications(userId: string, now: Date, canPush: boolean): Promise<number> {
  const startOfTomorrow = new Date(now);
  startOfTomorrow.setUTCHours(0, 0, 0, 0);
  startOfTomorrow.setUTCDate(startOfTomorrow.getUTCDate() + 1);
  const endOfTomorrow = new Date(startOfTomorrow);
  endOfTomorrow.setUTCDate(endOfTomorrow.getUTCDate() + 1);

  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);

  const dueTasks = await prisma.task.findMany({
    where: {
      userId,
      dueDate: { gte: startOfTomorrow, lt: endOfTomorrow },
      status: { notIn: ["COMPLETED", "DROPPED"] },
    },
  });

  let created = 0;
  for (const task of dueTasks) {
    const existing = await prisma.notification.findFirst({
      where: {
        userId,
        taskId: task.id,
        type: "TASK_DUE_TOMORROW",
        createdAt: { gte: startOfDay },
      },
    });
    if (existing) continue;

    let pushSent = false;
    if (canPush) {
      const pushed = await sendPushToUser(userId, {
        title: "Task due tomorrow",
        body: task.title,
        url: "/do-now",
        tag: `due-tomorrow-${task.id}`,
      });
      pushSent = pushed > 0;
    }

    await prisma.notification.create({
      data: {
        userId,
        taskId: task.id,
        type: "TASK_DUE_TOMORROW",
        title: "Task due tomorrow",
        body: task.title,
        link: "/do-now",
        sentViaPush: pushSent,
      },
    });

    created++;
  }

  return created;
}

async function processWeeklyReviewNudge(userId: string, now: Date, canPush: boolean): Promise<number> {
  const monday = getMondayOfWeek(now);

  const completedReview = await prisma.weeklyReview.findFirst({
    where: {
      userId,
      weekOf: { gte: monday },
      status: "COMPLETED",
    },
  });
  if (completedReview) return 0;

  // One nudge per week
  const existing = await prisma.notification.findFirst({
    where: {
      userId,
      type: "WEEKLY_REVIEW_REMINDER",
      createdAt: { gte: monday },
    },
  });
  if (existing) return 0;

  let pushSent = false;
  if (canPush) {
    const pushed = await sendPushToUser(userId, {
      title: "Time for your weekly review",
      body: "Keep your system trusted.",
      url: "/review",
      tag: "weekly-review",
    });
    pushSent = pushed > 0;
  }

  await prisma.notification.create({
    data: {
      userId,
      type: "WEEKLY_REVIEW_REMINDER",
      title: "Time for your weekly review",
      body: "Keep your system trusted -- review your lists, process your inbox, and get current.",
      link: "/review",
      sentViaPush: pushSent,
    },
  });

  return 1;
}

interface DigestPrefs {
  pushDailyDigest: boolean;
  emailEnabled: boolean;
  emailDailyDigest: boolean;
}

async function processDailyDigest(
  userId: string,
  userEmail: string,
  now: Date,
  prefs: DigestPrefs,
  canPush: boolean
): Promise<number> {
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);

  // Idempotency: one digest per user per day
  const existing = await prisma.notification.findFirst({
    where: {
      userId,
      type: "DAILY_DIGEST",
      createdAt: { gte: startOfDay },
    },
  });
  if (existing) return 0;

  const endOfDay = new Date(startOfDay);
  endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);

  const startOfTomorrow = endOfDay;
  const endOfTomorrow = new Date(startOfTomorrow);
  endOfTomorrow.setUTCDate(endOfTomorrow.getUTCDate() + 1);

  // Query task data
  const [dueTodayTasks, overdueTasks, dueTomorrowTasks] = await Promise.all([
    prisma.task.findMany({
      where: {
        userId,
        dueDate: { gte: startOfDay, lt: endOfDay },
        status: { notIn: ["COMPLETED", "DROPPED"] },
      },
      select: { title: true },
      orderBy: { dueDate: "asc" },
    }),
    prisma.task.findMany({
      where: {
        userId,
        dueDate: { lt: startOfDay },
        status: { notIn: ["COMPLETED", "DROPPED"] },
      },
      select: { title: true },
      orderBy: { dueDate: "asc" },
    }),
    prisma.task.findMany({
      where: {
        userId,
        dueDate: { gte: startOfTomorrow, lt: endOfTomorrow },
        status: { notIn: ["COMPLETED", "DROPPED"] },
      },
      select: { title: true },
      orderBy: { dueDate: "asc" },
    }),
  ]);

  const totalTasks = dueTodayTasks.length + overdueTasks.length + dueTomorrowTasks.length;

  // Build summary
  const parts: string[] = [];
  if (overdueTasks.length > 0) {
    parts.push(`${overdueTasks.length} overdue`);
  }
  if (dueTodayTasks.length > 0) {
    parts.push(`${dueTodayTasks.length} due today`);
  }
  if (dueTomorrowTasks.length > 0) {
    parts.push(`${dueTomorrowTasks.length} due tomorrow`);
  }

  const body = totalTasks === 0
    ? "No tasks due today, overdue, or due tomorrow."
    : parts.join(", ");

  // Push delivery
  let pushSent = false;
  if (canPush && prefs.pushDailyDigest) {
    const pushed = await sendPushToUser(userId, {
      title: "Daily Digest",
      body,
      url: "/do-now",
      tag: "daily-digest",
    });
    pushSent = pushed > 0;
  }

  // Email delivery
  let emailSent = false;
  if (prefs.emailEnabled && prefs.emailDailyDigest) {
    try {
      const dateStr = now.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      emailSent = await sendDailyDigestEmail(userEmail, dateStr, {
        dueToday: {
          count: dueTodayTasks.length,
          titles: dueTodayTasks.slice(0, 5).map((t) => t.title),
        },
        overdue: {
          count: overdueTasks.length,
          titles: overdueTasks.slice(0, 5).map((t) => t.title),
        },
        dueTomorrow: {
          count: dueTomorrowTasks.length,
          titles: dueTomorrowTasks.slice(0, 5).map((t) => t.title),
        },
      });
    } catch (err) {
      console.error("[digest] Failed to send digest email:", err);
    }
  }

  await prisma.notification.create({
    data: {
      userId,
      type: "DAILY_DIGEST",
      title: "Daily Digest",
      body,
      link: "/do-now",
      sentViaPush: pushSent,
      sentViaEmail: emailSent,
    },
  });

  return 1;
}

async function processDecisionDeadlineReminders(userId: string, now: Date, canPush: boolean): Promise<number> {
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // Find OPEN decisions where user is a respondent, deadline is within 24h, user hasn't responded yet
  const respondentEntries = await prisma.decisionRespondent.findMany({
    where: { userId },
    select: { decisionId: true },
  });
  if (respondentEntries.length === 0) return 0;

  const decisions = await prisma.decisionRequest.findMany({
    where: {
      id: { in: respondentEntries.map((r) => r.decisionId) },
      status: "OPEN",
      deadline: { gt: now, lte: in24Hours },
    },
    include: {
      responses: { where: { userId }, select: { id: true } },
      optionVotes: { where: { voterId: userId }, select: { id: true } },
      thread: { select: { taskId: true, projectId: true } },
    },
  });

  let created = 0;
  for (const decision of decisions) {
    // Skip if user already responded
    const hasResponded = decision.decisionType === "POLL"
      ? decision.optionVotes.length > 0
      : decision.responses.length > 0;
    if (hasResponded) continue;

    // Idempotency: one reminder per decision per day
    const existing = await prisma.notification.findFirst({
      where: {
        userId,
        type: "DECISION_DEADLINE",
        body: { contains: decision.id },
        createdAt: { gte: startOfDay },
      },
    });
    if (existing) continue;

    const link = decision.thread.taskId
      ? `/tasks/${decision.thread.taskId}`
      : decision.thread.projectId
        ? `/projects/${decision.thread.projectId}`
        : `/decisions/${decision.id}`;

    let pushSent = false;
    if (canPush) {
      const pushed = await sendPushToUser(userId, {
        title: "Decision deadline approaching",
        body: decision.question.slice(0, 100),
        url: link,
        tag: `decision-deadline-${decision.id}`,
      });
      pushSent = pushed > 0;
    }

    await prisma.notification.create({
      data: {
        userId,
        type: "DECISION_DEADLINE",
        title: "Decision deadline approaching",
        body: `${decision.question.slice(0, 100)} [${decision.id}]`,
        link,
        sentViaPush: pushSent,
      },
    });

    created++;
  }

  return created;
}

async function processDecisionExpiry(now: Date): Promise<number> {
  // Find all OPEN decisions past their deadline
  const expired = await prisma.decisionRequest.findMany({
    where: {
      status: "OPEN",
      deadline: { lt: now },
    },
    include: {
      thread: true,
      respondents: true,
    },
  });

  let count = 0;
  for (const decision of expired) {
    await prisma.$transaction(async (tx) => {
      await tx.decisionRequest.update({
        where: { id: decision.id },
        data: { status: "EXPIRED" },
      });

      await tx.thread.update({
        where: { id: decision.threadId },
        data: { isResolved: true, resolvedAt: new Date() },
      });

      await tx.waitingFor.updateMany({
        where: { threadId: decision.threadId, isResolved: false },
        data: { isResolved: true, resolvedAt: new Date() },
      });

      // Notify all respondents + requester
      const notifyIds = Array.from(new Set([
        decision.requesterId,
        ...decision.respondents.map((r) => r.userId),
      ]));
      const link = `/decisions/${decision.id}`;
      for (const uid of notifyIds) {
        await tx.notification.create({
          data: {
            userId: uid,
            type: "DECISION_EXPIRED",
            title: "Decision expired",
            body: decision.question.slice(0, 200),
            link,
          },
        });
      }
    });

    count++;
  }

  return count;
}

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  d.setUTCDate(diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
