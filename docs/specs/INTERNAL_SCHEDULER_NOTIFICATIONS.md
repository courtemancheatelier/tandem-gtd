# Internal Scheduler — Notifications

**Status:** Spec
**Branch:** `release/1.9` (forward-port to `main`)
**Replaces:** `POST /api/cron/notifications` (external cron)
**Predecessor:** `INTERNAL_SCHEDULER_RECURRING_MISSED.md`

## Goal

Stop relying on an external cron service to drive notification dispatch.
Run the same work on an in-process timer started when the Next.js server
boots.

Unlike `recurring-missed`, this job **must fire even when no user is
visiting the app** — daily digests, due-today push, overdue push, weekly
review nudges, decision-deadline reminders, and decision expiry all need
to land in users' notification trays/inboxes whether they're looking or
not. So a lazy-on-request strategy is not enough on its own. We need a
real ticker.

## Background

`POST /api/cron/notifications` today does six things on every tick:

1. Expire OPEN decisions past their deadline (global, runs once)
2. Per user: create due-today / overdue / due-tomorrow notifications (with
   push delivery if subscribed and not in quiet hours)
3. Per user: send daily digest at the user's configured `reminderTimeHour`
   (push and/or email)
4. Per user: weekly review nudge on the configured day
5. Per user: decision deadline reminders (within 24h of deadline)
6. (Implicit) per-task idempotency via existing-row checks on `notification`

External cron hits this endpoint every ~15 minutes. The 15-minute cadence
is what makes the digest's `currentHour === reminderTimeHour` check
reliable (it'll fire 4 times during the matching hour; the
once-per-day idempotency check ensures only one digest is created).

## Strategy: In-Process Interval Ticker

### Why a ticker, not lazy

- Daily digest at 7am must arrive when the user is asleep.
- Push notifications for due-today must reach the phone before the user
  opens the app.
- Decision expiry must happen on time regardless of who's online.

### Why `setInterval`, not `node-cron`

- Zero new dependencies.
- The work already runs every 15 minutes regardless of wall-clock alignment;
  there's no business reason to fire at exactly `:00 :15 :30 :45`.
- Internal idempotency (notification dedupe by day, digest by day) means a
  small jitter on first-tick-after-boot is harmless.

### Single-process invariant

Each Tandem instance runs **one Node process per database**. A single
in-process `setInterval` is therefore the unique scheduler for that DB.
**Do not run multiple Node processes against one Tandem DB without
adding leader election.** This is documented in CLAUDE.md as part of this
spec.

### Boot lifecycle

Use Next.js's stable `instrumentation.ts` hook (Next 14.2+):

```ts
// src/instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.INTERNAL_SCHEDULER_ENABLED === "false") return;
  const { startNotificationScheduler } = await import("@/lib/scheduler/notification-scheduler");
  startNotificationScheduler();
}
```

The dynamic import keeps Prisma + service code out of the Edge runtime
and out of the build worker.

### Tick cadence

```
const TICK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
```

First tick fires `TICK_INTERVAL_MS` after boot (not immediately on boot —
gives the server a moment to settle, and the lazy `recurring-missed`
sweep handles users who arrive in that first window).

### Overlap protection

A single in-flight guard:

```ts
let running = false;
async function tick() {
  if (running) return;
  running = true;
  try { await runNotificationTick(new Date()); }
  catch (err) { console.error("[scheduler] notifications tick failed:", err); }
  finally { running = false; }
}
```

A 15-minute interval should never overlap a tick that takes seconds, but
the guard makes a regression in tick duration self-limiting rather than
self-amplifying.

### Graceful shutdown

```ts
process.once("SIGTERM", () => clearInterval(handle));
process.once("SIGINT",  () => clearInterval(handle));
```

systemd `restart` sends SIGTERM, so this lets an in-flight tick finish
without being killed mid-write.

## Code Changes

### 1. Extract `runNotificationTick`

Create `src/lib/services/notification-tick-service.ts` and move the
**entire body** of `POST /api/cron/notifications` into it as
`runNotificationTick(now: Date): Promise<NotificationTickResult>`. All
the local helper functions (`processDueTodayNotifications`,
`processOverdueNotifications`, `processDueTomorrowNotifications`,
`processWeeklyReviewNudge`, `processDailyDigest`,
`processDecisionDeadlineReminders`, `processDecisionExpiry`,
`getMondayOfWeek`) move with it.

The service has no dependency on `NextRequest` / `NextResponse` — pure
business logic, callable from anywhere.

### 2. Create the scheduler module

`src/lib/scheduler/notification-scheduler.ts`:

```ts
import { runNotificationTick } from "@/lib/services/notification-tick-service";

const TICK_INTERVAL_MS = 15 * 60 * 1000;
let handle: NodeJS.Timeout | null = null;
let running = false;

export function startNotificationScheduler() {
  if (handle) return; // idempotent — defensive against double-register

  console.log("[scheduler] notification scheduler starting (15 min interval)");

  handle = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const result = await runNotificationTick(new Date());
      console.log("[scheduler] notification tick:", result);
    } catch (err) {
      console.error("[scheduler] notification tick failed:", err);
    } finally {
      running = false;
    }
  }, TICK_INTERVAL_MS);

  const stop = () => {
    if (handle) clearInterval(handle);
    handle = null;
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
}
```

### 3. Add `instrumentation.ts`

```ts
// src/instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.INTERNAL_SCHEDULER_ENABLED === "false") return;
  const { startNotificationScheduler } = await import(
    "@/lib/scheduler/notification-scheduler"
  );
  startNotificationScheduler();
}
```

### 4. Refactor cron route to a thin wrapper

`src/app/api/cron/notifications/route.ts` shrinks to:

```ts
import { NextRequest, NextResponse } from "next/server";
import { runNotificationTick } from "@/lib/services/notification-tick-service";

const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runNotificationTick(new Date());
  return NextResponse.json(result);
}
```

External cron continues to work, in case it's still wired up. Removal is
a follow-up after the in-process scheduler is proven on beta.

### 5. Document the env flag

Add to `.env.example`:

```
# Internal scheduler — set to "false" to disable in-process tick
# (e.g. when running multiple Node processes against one DB, which
# requires leader election that we have not implemented).
INTERNAL_SCHEDULER_ENABLED=true
```

## Edge Cases

- **Server restart mid-tick.** SIGTERM handler clears the interval but a
  tick already in flight will run to completion (or be killed by
  systemd's TimeoutStopSec, default 90s — well above tick duration).
  Idempotency in the helpers means the next tick after restart will not
  duplicate work.
- **Server restart at 6:59am with digest hour = 7.** First tick after
  boot fires 15 min later (~7:14am). `currentHour === 7` still true, so
  digest is sent. Late by up to 14 min, no data lost.
- **Server down through 7am entirely.** Digest is missed for that day.
  Same behavior as if external cron was down. Acceptable.
- **Two Node processes accidentally started against one DB.** Both tick
  every 15 min. Idempotency saves correctness (notification dedupe rows
  exist), but each tick does ~2x the work and pushes ~2x notifications.
  The `INTERNAL_SCHEDULER_ENABLED=false` env flag is the escape hatch
  while a real leader-election fix is built. Spec leaves leader election
  out of scope.
- **Tick takes longer than the interval** (e.g. database stall): the
  `running` guard skips the next tick. Logged. No pile-up.
- **Edge runtime / build worker.** Guarded by `NEXT_RUNTIME === "nodejs"`
  check in `instrumentation.ts`. The dynamic import means scheduler code
  never enters the Edge bundle.

## Testing

1. **Unit:** `runNotificationTick` is a pure function of (now, DB state).
   Existing helper logic is unchanged; coverage parity with current cron
   route is sufficient.
2. **Integration:** start the server, set `reminderTimeHour` to current
   hour for a test user, wait one tick, assert a `DAILY_DIGEST`
   notification row exists.
3. **Manual on alpha:**
   - Restart `tandem-alpha`, watch logs for `[scheduler] notification scheduler starting`
   - Wait 15 minutes, see `[scheduler] notification tick: { ... }`
   - Verify a notification arrives without any external cron hitting the
     route.
   - Hit `POST /api/cron/notifications` manually with the bearer token
     to confirm the route still works.
4. **Restart safety:** `sudo systemctl restart tandem-alpha` mid-tick;
   service restarts cleanly, next tick proceeds normally.

## Rollback

If the in-process scheduler misbehaves on beta: set
`INTERNAL_SCHEDULER_ENABLED=false` in the systemd environment for the
beta service and restart. The cron route is still wired up, so external
cron (if still configured) keeps notifications flowing. Zero schema
changes to roll back.

## Out of Scope

- `recurring-missed` — already done.
- `trial`, `retention` — daily ticks. Will reuse the scheduler module
  pattern; their specs come next.
- Leader election for horizontal scaling. Not needed for current
  topology; flagged in CLAUDE.md and `.env.example`.
- Removal of `/api/cron/notifications/route.ts` — deferred until after
  beta validation.

## Feature Completeness Checklist

- [ ] `notification-tick-service.ts` extracted from cron route, all
      helpers moved with it
- [ ] `notification-scheduler.ts` created with start function, in-flight
      guard, and SIGTERM/SIGINT cleanup
- [ ] `src/instrumentation.ts` created and gated by NEXT_RUNTIME +
      INTERNAL_SCHEDULER_ENABLED
- [ ] Cron route refactored to thin wrapper around `runNotificationTick`
- [ ] `.env.example` updated with `INTERNAL_SCHEDULER_ENABLED`
- [ ] CLAUDE.md updated noting "one Node process per DB" invariant
- [ ] Tested on alpha across at least one tick boundary and one
      digest hour
- [ ] CHANGELOG entry under v1.9
