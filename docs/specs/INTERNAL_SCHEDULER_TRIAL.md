# Internal Scheduler — Trial Reminders

**Status:** Spec
**Branch:** `release/1.9` (forward-port to `main`)
**Replaces:** `POST /api/cron/trial` (external cron)
**Predecessor:** `INTERNAL_SCHEDULER_NOTIFICATIONS.md`

## Goal

Move the trial-expiry reminder cron into the in-process scheduler. Same
ticker, same kill switch, same lazy-boot-from-prisma pattern as
notifications.

## Background

`POST /api/cron/trial` runs once a day (or whatever the external cron
cadence was), looks for users on trial whose `trialExpiresAt` is exactly
7 or 3 days away, and sends a reminder email + creates an in-app
`TRIAL_REMINDER` notification. Idempotent at the day level via an
existing-row check on `notification`.

## Strategy

Piggyback on the existing 15-minute notification ticker, but gate the
trial work behind a **daily-run flag** so it only fires once per UTC day
even though the surrounding tick fires 96 times per day.

This pattern (a daily slot inside the 15-min loop) will be reused for
`retention` next.

### Daily gate

Add a single in-memory flag at the scheduler module level:

```ts
let lastDailyRunDay: string | null = null; // YYYY-MM-DD UTC
```

Inside each tick, after the notification work:

```ts
const today = new Date().toISOString().slice(0, 10);
if (lastDailyRunDay !== today) {
  await runTrialTick(new Date());
  // future: await runRetentionTick(new Date());
  lastDailyRunDay = today;
}
```

The flag is process-local — on a server restart it resets, meaning the
first tick after restart will re-run the daily jobs. That is **safe**
because `runTrialTick` is idempotent (per-day notification dedupe). No
duplicate emails or notifications are produced.

### Why not a separate daily setInterval?

A 24h `setInterval` from boot time fires at boot-time + 24h, drifting
relative to wall clock. The 15-min loop with a UTC-day gate naturally
fires within 15 minutes of UTC midnight, every day, regardless of when
the server booted.

## Code Changes

### 1. Extract `runTrialTick`

Create `src/lib/services/trial-tick-service.ts`. Move the entire body of
`POST /api/cron/trial` into it as `runTrialTick(now: Date): Promise<TrialTickResult>`.
Return shape: `{ reminders: number; errors: number }`.

### 2. Add daily gate to the scheduler

Modify `src/lib/scheduler/notification-scheduler.ts`:

- Add module-level `let lastDailyRunDay: string | null = null;`
- After the `runNotificationTick` call inside the interval handler, check
  the flag and run `runTrialTick` if needed.
- Wrap in its own try/catch so a trial failure doesn't kill the next
  notification tick.

(Module name stays `notification-scheduler.ts` for now; rename to
`scheduler.ts` in a follow-up cleanup once all four crons are migrated.)

### 3. Refactor cron route to thin wrapper

`src/app/api/cron/trial/route.ts` shrinks to:

```ts
export async function POST(req: NextRequest) {
  // auth check
  const result = await runTrialTick(new Date());
  return NextResponse.json(result);
}
```

External cron can still hit it; route is removed in a future cleanup.

## Edge Cases

- **Server restart between midnight and the daily slot.** First tick
  after restart re-runs trial; idempotency in `runTrialTick` prevents
  duplicate notifications/emails.
- **Server down through the daily slot entirely.** No reminder sent that
  day. Same behavior as if external cron was down. Acceptable.
- **Email send fails for one user.** The cron loop catches per-user, logs,
  and continues. Same behavior as current code.

## Testing

1. **Manual on alpha:** create a test user with `trialExpiresAt` exactly
   7 days from now. Wait for next 15-min tick. Confirm `TRIAL_REMINDER`
   notification row exists and email arrives. Wait another 15 min.
   Confirm no duplicate notification (idempotency check holds).
2. **Cron-route wrapper:** hit `POST /api/cron/trial` with the bearer
   token after the daily slot has already fired. Confirm the route still
   works and returns `{ reminders: 0, errors: 0 }` (idempotent).
3. **Restart safety:** restart `tandem-alpha` mid-day. Watch logs for
   the daily gate firing once on the next tick.

## Out of Scope

- `retention` cron — next spec, same daily-gate pattern.
- Removal of `/api/cron/trial/route.ts` — deferred until all four cron
  routes are removed in a single cleanup commit.
- Renaming `notification-scheduler.ts` → `scheduler.ts` — same cleanup.

## Feature Completeness Checklist

- [ ] `trial-tick-service.ts` extracted from cron route
- [ ] Daily-run gate added to scheduler module
- [ ] `runTrialTick` wired into the 15-min loop with its own try/catch
- [ ] Cron route refactored to thin wrapper
- [ ] Tested on alpha across the daily slot boundary
- [ ] CHANGELOG entry under v1.9
