# Notifications & Reminders

> **Status:** Implemented (Phases 1-3)
> **Last updated:** 2026-02-25

---

## 1. Problem Statement

### The Need

A GTD system's value proposition is that nothing falls through the cracks. Tandem has due dates on tasks, a weekly review flow, scheduled/ticklered tasks, and recurring templates -- but none of these proactively reach out to the user. If you forget to open Tandem on a Tuesday, the task that was due Tuesday silently goes overdue. If you skip the weekly review for three weeks, nothing nags you. The system tracks what matters but never taps you on the shoulder.

Push notifications are the missing link between "the system knows" and "the user acts." Tandem is already a PWA with a service worker (`public/sw.js`), which means Web Push API support is one layer away.

### What "Done" Looks Like

1. **Push notifications on mobile and desktop** -- tasks due today generate a push notification in the morning. Overdue tasks escalate daily until addressed.
2. **Weekly review nudge** -- if no `WeeklyReview` with status `COMPLETED` exists for the current week by a configurable day (default: Friday), the user gets a push nudge.
3. **Daily digest** -- an optional morning summary (push or email) listing today's tasks, overdue count, inbox count, and upcoming due dates.
4. **In-app notification center** -- a bell icon in the header showing unread notification count, expandable to a list of recent notifications with mark-as-read.
5. **User-controlled preferences** -- per-user settings for push on/off, quiet hours, reminder timing (day-of, day-before, etc.), daily digest on/off.
6. **Background cron** -- a `POST /api/cron/notifications` endpoint that a systemd timer or external scheduler hits periodically to evaluate and send notifications.

### Design Constraints

- Web Push API via VAPID (no third-party push services)
- Service worker already exists at `public/sw.js` -- extend it, don't replace it
- Cron endpoint follows the pattern established by the Recurring Card File spec (`POST /api/cron/recurring` with `CRON_SECRET` bearer auth)
- In-app notifications use existing shadcn/ui components (Popover, ScrollArea, Badge)
- No email sending in Phase 1 -- push only. Email can layer on later via a provider like Resend or Postmark.

---

## 2. Data Model Changes

### 2.1 PushSubscription

Stores Web Push API subscriptions per user per device:

```prisma
model PushSubscription {
  id        String   @id @default(cuid())
  endpoint  String   @db.Text    // Web Push endpoint URL
  p256dh    String               // Client public key
  auth      String               // Auth secret
  userAgent String?              // Browser/device identifier for UI display
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, endpoint])
  @@index([userId])
}
```

A user can have multiple subscriptions (phone + laptop + tablet). The `@@unique([userId, endpoint])` constraint prevents duplicate registrations for the same browser.

### 2.2 Notification

Stores in-app notifications for the notification center:

```prisma
enum NotificationType {
  TASK_DUE_TODAY
  TASK_OVERDUE
  TASK_DUE_TOMORROW
  WEEKLY_REVIEW_REMINDER
  DAILY_DIGEST
  HORIZON_REVIEW_DUE
  SYSTEM
}

model Notification {
  id        String           @id @default(cuid())
  type      NotificationType
  title     String
  body      String?          @db.Text
  link      String?          // Relative URL to navigate to (e.g. "/do-now", "/review")
  isRead    Boolean          @default(false)
  readAt    DateTime?
  sentViaPush Boolean        @default(false) // Whether push was sent
  createdAt DateTime         @default(now())

  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Optional link to the task/review that triggered this
  taskId String?
  task   Task?  @relation(fields: [taskId], references: [id], onDelete: SetNull)

  @@index([userId, isRead])
  @@index([userId, createdAt])
  @@index([taskId])
}
```

### 2.3 NotificationPreference

Per-user notification settings:

```prisma
model NotificationPreference {
  id     String @id @default(cuid())
  userId String @unique
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Push notifications
  pushEnabled          Boolean @default(true)
  pushDueToday         Boolean @default(true)   // "Task X is due today"
  pushDueTomorrow      Boolean @default(false)  // "Task X is due tomorrow"
  pushOverdue          Boolean @default(true)   // "Task X is overdue"
  pushWeeklyReview     Boolean @default(true)   // "Time for your weekly review"
  pushDailyDigest      Boolean @default(false)  // Morning summary via push

  // Timing
  reminderTimeHour     Int     @default(8)      // Hour (0-23) to send morning reminders
  reminderTimeMinute   Int     @default(0)      // Minute (0-59)
  weeklyReviewDay      Int     @default(5)      // Day to nudge review (0=Sun, 5=Fri)
  quietHoursStart      Int?                     // Hour to stop sending (null = no quiet hours)
  quietHoursEnd        Int?                     // Hour to resume sending

  // Email (future)
  emailEnabled         Boolean @default(false)
  emailDailyDigest     Boolean @default(false)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### 2.4 User Relation Updates

Add to the `User` model:

```prisma
// In model User
pushSubscriptions        PushSubscription[]
notifications            Notification[]
notificationPreference   NotificationPreference?
```

### 2.5 Task Relation Update

Add to the `Task` model:

```prisma
// In model Task
notifications Notification[]
```

---

## 3. Web Push Infrastructure

### 3.1 VAPID Key Generation

Generate a VAPID key pair once per server installation. Store in environment variables:

```bash
# .env
VAPID_PUBLIC_KEY="BNxH..."
VAPID_PRIVATE_KEY="y3dG..."
VAPID_SUBJECT="mailto:admin@tandem.app"
```

Generation script (run once during setup):

```typescript
// scripts/generate-vapid-keys.ts
import webpush from "web-push";

const vapidKeys = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY="${vapidKeys.publicKey}"`);
console.log(`VAPID_PRIVATE_KEY="${vapidKeys.privateKey}"`);
```

### 3.2 Service Worker Push Handler

Add push event handling to `public/sw.js`:

```javascript
// ─── Push ────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    tag: data.tag || 'tandem-notification',  // Collapse similar notifications
    renotify: !!data.renotify,
    data: {
      url: data.url || '/do-now',  // URL to open on click
    },
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Tandem', options)
  );
});

// ─── Notification Click ──────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/do-now';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing Tandem tab if open
      for (const client of clientList) {
        if (new URL(client.url).origin === self.location.origin) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      // Otherwise open a new window
      return clients.openWindow(targetUrl);
    })
  );
});
```

### 3.3 Push Subscription API

**`POST /api/push-subscriptions`** -- subscribe a device

```typescript
// src/app/api/push-subscriptions/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId, unauthorized, badRequest } from "@/lib/api/auth-helpers";

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  userAgent: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const body = await req.json();
  const parsed = subscriptionSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues[0].message);

  const { endpoint, keys, userAgent } = parsed.data;

  const subscription = await prisma.pushSubscription.upsert({
    where: { userId_endpoint: { userId, endpoint } },
    update: { p256dh: keys.p256dh, auth: keys.auth, userAgent },
    create: { userId, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent },
  });

  return NextResponse.json(subscription, { status: 201 });
}

// DELETE — unsubscribe
export async function DELETE(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const { endpoint } = await req.json();
  await prisma.pushSubscription.deleteMany({
    where: { userId, endpoint },
  });

  return NextResponse.json({ ok: true });
}
```

### 3.4 Push Sending Utility

```typescript
// src/lib/push.ts
import webpush from "web-push";
import { prisma } from "@/lib/prisma";

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

interface PushPayload {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
  renotify?: boolean;
}

/**
 * Send a push notification to all of a user's subscribed devices.
 * Automatically removes expired/invalid subscriptions.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
  });

  let sent = 0;
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify(payload)
      );
      sent++;
    } catch (error: any) {
      // 404 or 410 means the subscription is expired/invalid
      if (error.statusCode === 404 || error.statusCode === 410) {
        await prisma.pushSubscription.delete({ where: { id: sub.id } });
      }
    }
  }

  return sent;
}
```

---

## 4. Cron Notification Endpoint

### 4.1 Route

`POST /api/cron/notifications` -- runs on a schedule (recommended: every 15 minutes, or hourly at minimum).

```typescript
// src/app/api/cron/notifications/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";

const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const results = { dueTodayNotifications: 0, overdueNotifications: 0, reviewNudges: 0 };

  // Get all users with push enabled
  const users = await prisma.user.findMany({
    where: {
      isDisabled: false,
      notificationPreference: { pushEnabled: true },
    },
    include: {
      notificationPreference: true,
      pushSubscriptions: { take: 1 }, // Only need to know if they have any
    },
  });

  for (const user of users) {
    if (user.pushSubscriptions.length === 0) continue;
    const prefs = user.notificationPreference;
    if (!prefs) continue;

    // Check quiet hours
    const userHour = now.getUTCHours(); // Simplified; ideally use user timezone
    if (prefs.quietHoursStart != null && prefs.quietHoursEnd != null) {
      if (isInQuietHours(userHour, prefs.quietHoursStart, prefs.quietHoursEnd)) continue;
    }

    // --- Due Today Notifications ---
    if (prefs.pushDueToday) {
      results.dueTodayNotifications += await processDueTodayNotifications(user.id, now);
    }

    // --- Overdue Notifications ---
    if (prefs.pushOverdue) {
      results.overdueNotifications += await processOverdueNotifications(user.id, now);
    }

    // --- Weekly Review Nudge ---
    if (prefs.pushWeeklyReview && now.getUTCDay() === prefs.weeklyReviewDay) {
      results.reviewNudges += await processWeeklyReviewNudge(user.id, now);
    }
  }

  return NextResponse.json(results);
}
```

### 4.2 Notification Logic Functions

```typescript
async function processDueTodayNotifications(userId: string, now: Date): Promise<number> {
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

  let sent = 0;
  for (const task of dueTasks) {
    // Idempotency: check if we already notified for this task today
    const existing = await prisma.notification.findFirst({
      where: {
        userId,
        taskId: task.id,
        type: "TASK_DUE_TODAY",
        createdAt: { gte: startOfDay },
      },
    });
    if (existing) continue;

    // Create in-app notification
    await prisma.notification.create({
      data: {
        userId,
        taskId: task.id,
        type: "TASK_DUE_TODAY",
        title: "Task due today",
        body: task.title,
        link: "/do-now",
        sentViaPush: true,
      },
    });

    // Send push
    await sendPushToUser(userId, {
      title: "Task due today",
      body: task.title,
      url: "/do-now",
      tag: `due-today-${task.id}`,
    });

    sent++;
  }

  return sent;
}

async function processOverdueNotifications(userId: string, now: Date): Promise<number> {
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);

  const overdueTasks = await prisma.task.findMany({
    where: {
      userId,
      dueDate: { lt: startOfDay },
      status: { notIn: ["COMPLETED", "DROPPED"] },
    },
  });

  let sent = 0;
  for (const task of overdueTasks) {
    // Only notify once per day per overdue task
    const existing = await prisma.notification.findFirst({
      where: {
        userId,
        taskId: task.id,
        type: "TASK_OVERDUE",
        createdAt: { gte: startOfDay },
      },
    });
    if (existing) continue;

    const daysOverdue = Math.floor((startOfDay.getTime() - task.dueDate!.getTime()) / 86400000);

    await prisma.notification.create({
      data: {
        userId,
        taskId: task.id,
        type: "TASK_OVERDUE",
        title: `Task overdue (${daysOverdue} day${daysOverdue === 1 ? "" : "s"})`,
        body: task.title,
        link: "/do-now",
        sentViaPush: true,
      },
    });

    await sendPushToUser(userId, {
      title: `Task overdue (${daysOverdue}d)`,
      body: task.title,
      url: "/do-now",
      tag: `overdue-${task.id}`,
      renotify: true,
    });

    sent++;
  }

  return sent;
}

async function processWeeklyReviewNudge(userId: string, now: Date): Promise<number> {
  // Check if a review was completed this week
  const monday = getMondayOfWeek(now);
  const completedReview = await prisma.weeklyReview.findFirst({
    where: {
      userId,
      weekOf: { gte: monday },
      status: "COMPLETED",
    },
  });
  if (completedReview) return 0;

  // Idempotency: only one nudge per week
  const existing = await prisma.notification.findFirst({
    where: {
      userId,
      type: "WEEKLY_REVIEW_REMINDER",
      createdAt: { gte: monday },
    },
  });
  if (existing) return 0;

  await prisma.notification.create({
    data: {
      userId,
      type: "WEEKLY_REVIEW_REMINDER",
      title: "Time for your weekly review",
      body: "Keep your system trusted -- review your lists, process your inbox, and get current.",
      link: "/review",
      sentViaPush: true,
    },
  });

  await sendPushToUser(userId, {
    title: "Time for your weekly review",
    body: "Keep your system trusted.",
    url: "/review",
    tag: "weekly-review",
  });

  return 1;
}

function isInQuietHours(currentHour: number, start: number, end: number): boolean {
  if (start <= end) {
    return currentHour >= start && currentHour < end;
  }
  // Wraps midnight (e.g., 22:00 - 07:00)
  return currentHour >= start || currentHour < end;
}

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  d.setUTCDate(diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
```

---

## 5. In-App Notification Center

### 5.1 API Routes

**`GET /api/notifications`** -- list notifications for the current user

```typescript
// Query params: ?unreadOnly=true&limit=50
const items = await prisma.notification.findMany({
  where: {
    userId,
    ...(unreadOnly ? { isRead: false } : {}),
  },
  orderBy: { createdAt: "desc" },
  take: limit,
});
```

**`PATCH /api/notifications/[id]`** -- mark as read

**`POST /api/notifications/mark-all-read`** -- mark all as read

**`GET /api/notifications/unread-count`** -- returns `{ count: number }` for the badge

### 5.2 UI Component

```
src/components/notifications/
  NotificationBell.tsx       -- Bell icon + unread count badge in header
  NotificationPanel.tsx      -- Popover list of recent notifications
  NotificationItem.tsx       -- Individual notification row
```

**NotificationBell** sits in the header bar (the `Nav` component in `src/components/layout/nav.tsx`). It polls `/api/notifications/unread-count` every 60 seconds (or uses a simple polling hook). Clicking opens a Popover with `NotificationPanel`.

**NotificationPanel** shows the 20 most recent notifications with:
- Type icon (bell for reminders, calendar for due dates, clipboard for review)
- Title + body text
- Relative timestamp ("2h ago", "Yesterday")
- Unread indicator (blue dot)
- Click navigates to `notification.link` and marks as read
- "Mark all as read" button at the top

### 5.3 Notification Preferences UI

Add a "Notifications" section to the settings page (`/settings`):

```
┌───────────────────────────────────────────────────────┐
│  Notifications                                         │
├───────────────────────────────────────────────────────┤
│                                                        │
│  Push Notifications              [Toggle: ON]          │
│  Subscribed devices: Chrome (macOS), Safari (iPhone)   │
│                                                        │
│  What to notify about:                                 │
│  ☑ Task due today                                      │
│  ☐ Task due tomorrow                                   │
│  ☑ Task overdue                                        │
│  ☑ Weekly review reminder                              │
│  ☐ Daily digest                                        │
│                                                        │
│  Reminder time: [08:00 ▾]                              │
│  Weekly review day: [Friday ▾]                         │
│  Quiet hours: [22:00] to [07:00]                       │
│                                                        │
└───────────────────────────────────────────────────────┘
```

Push toggle triggers the browser's `Notification.requestPermission()` flow and calls `POST /api/push-subscriptions` on success.

---

## 6. Client-Side Push Registration

### 6.1 PushSubscriptionManager Component

```typescript
// src/components/notifications/PushSubscriptionManager.tsx
"use client";

import { useEffect, useState } from "react";

export function usePushSubscription() {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    if ("Notification" in window) {
      setPermission(Notification.permission);
    }
  }, []);

  async function subscribe() {
    const perm = await Notification.requestPermission();
    setPermission(perm);
    if (perm !== "granted") return false;

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
    });

    const json = subscription.toJSON();
    await fetch("/api/push-subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: json.keys,
        userAgent: navigator.userAgent,
      }),
    });

    setSubscribed(true);
    return true;
  }

  async function unsubscribe() {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await fetch("/api/push-subscriptions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      await subscription.unsubscribe();
    }
    setSubscribed(false);
  }

  return { permission, subscribed, subscribe, unsubscribe };
}
```

### 6.2 CSP Update

The `connect-src` directive in `next.config.js` currently allows only `'self'`. Web Push endpoints are on external domains (e.g., `fcm.googleapis.com`, `updates.push.services.mozilla.com`). However, the push subscription and sending happen server-side via the `web-push` npm package, so no CSP change is needed for that. The `Notification` API and `PushManager` are browser APIs that don't make fetch requests subject to CSP.

---

## 7. Implementation Phases

### Phase 1: Push Infrastructure + Due Date Alerts

**Goal:** Push notifications work end-to-end for due-today and overdue tasks.

**Schema changes:**
- Add `PushSubscription`, `Notification`, `NotificationPreference` models
- Add `NotificationType` enum
- Add relations on `User` and `Task`
- Migration: `npx prisma migrate dev --name add-notifications`

**Dependencies:**
- `npm install web-push` + `@types/web-push`

**Environment variables:**
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (same as VAPID_PUBLIC_KEY, exposed to client)

**New files:**
- `src/lib/push.ts` -- VAPID setup + `sendPushToUser()`
- `src/app/api/push-subscriptions/route.ts` -- subscribe/unsubscribe
- `src/app/api/cron/notifications/route.ts` -- cron endpoint
- `src/app/api/notifications/route.ts` -- list notifications
- `src/app/api/notifications/[id]/route.ts` -- mark as read
- `src/app/api/notifications/unread-count/route.ts` -- badge count
- `src/app/api/notifications/mark-all-read/route.ts`
- `src/lib/validations/notification.ts` -- Zod schemas
- `src/components/notifications/PushSubscriptionManager.tsx` -- client-side hook
- `scripts/generate-vapid-keys.ts`

**Modified files:**
- `prisma/schema.prisma` -- new models
- `public/sw.js` -- add push + notificationclick handlers
- `.env.example` -- add VAPID vars and CRON_SECRET
- `next.config.js` -- no change needed (push is server-side)

**Files touched:** ~14

### Phase 2: In-App Notification Center

**Goal:** Bell icon in header with notification list.

**New files:**
- `src/components/notifications/NotificationBell.tsx`
- `src/components/notifications/NotificationPanel.tsx`
- `src/components/notifications/NotificationItem.tsx`

**Modified files:**
- `src/components/layout/nav.tsx` -- add NotificationBell to header

**Files touched:** ~4

### Phase 3: Weekly Review Nudge + Notification Preferences UI

**Goal:** Weekly review reminder and user-configurable settings.

**New files:**
- `src/components/settings/NotificationSettings.tsx`
- `src/app/api/notification-preferences/route.ts` -- GET, PATCH

**Modified files:**
- `src/app/(dashboard)/settings/page.tsx` -- add Notifications section
- `src/app/api/cron/notifications/route.ts` -- add weekly review nudge logic

**Files touched:** ~4

### Phase 4: Daily Digest + Email Foundation

**Goal:** Optional morning summary. Email infrastructure stub.

**New files:**
- `src/lib/notifications/daily-digest.ts` -- build digest content
- `src/lib/email.ts` -- email sending utility (Resend/Postmark)

**Modified files:**
- `src/app/api/cron/notifications/route.ts` -- add daily digest logic
- `.env.example` -- add email provider vars

**Files touched:** ~4

---

## 8. Edge Cases

- **Timezone handling:** The cron runs in UTC. User preferences store hour/minute but not timezone. Phase 1 uses UTC; a `timezone` field on `NotificationPreference` (or `User`) should be added when multi-timezone support matters. The `reminderTimeHour` should be interpreted in the user's timezone.
- **Expired subscriptions:** Web Push endpoints become invalid when a user uninstalls the browser or clears data. The `sendPushToUser` function already handles 404/410 responses by deleting the subscription record.
- **Notification spam:** Idempotency guards (check for existing notification of the same type + task + date) prevent duplicate sends even if the cron runs multiple times.
- **Quiet hours wrapping midnight:** The `isInQuietHours` helper handles the wrap case (e.g., 22:00 to 07:00).
- **No push permission:** If the user declines the browser permission prompt, the UI shows a helpful message explaining how to re-enable it in browser settings.
- **Multiple tabs:** The service worker's `notificationclick` handler checks for existing Tandem tabs before opening a new one.

---

## 9. What This Spec Does Not Cover

- **Real-time WebSocket notifications** -- polling every 60 seconds is sufficient for the notification bell. WebSockets can be added later if real-time is needed for team collaboration features.
- **Email delivery infrastructure** -- Phase 4 stubs the email layer but does not specify a provider. That's a deployment decision.
- **Per-project or per-task notification overrides** -- all notification logic is user-level. Per-item "notify me" toggles can layer on later.
- **Team notifications** -- notifications about shared project activity, task assignments, etc. belong in the Teams spec expansion.
- **SMS notifications** -- out of scope for a self-hosted PWA.
```

---
