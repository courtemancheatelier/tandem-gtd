# Internal Scheduler — Recurring Missed Sweep

**Status:** Spec
**Branch:** `release/1.9` (also forward-port to `main`)
**Replaces:** `POST /api/cron/recurring-missed` (external cron)

## Goal

Eliminate the external cron dependency for the end-of-day "mark routine
tasks as missed" sweep. Move the work into the request lifecycle of the
authenticated user it concerns, so no external scheduler needs to fire it.

This is the first in a series of specs that retire the four cron endpoints
under `src/app/api/cron/`. Each cron gets its own spec because each has
different timing constraints (some need to fire when no user is present —
those will use an in-process scheduler in a later spec).

## Background

Today, `POST /api/cron/recurring-missed` is hit every ~15 minutes by an
external scheduler. It walks every routine task in the database, checks
each task's user-local timezone, and if `scheduledDate < startOfLocalToday`
in that user's timezone:

- **Simple routines:** marks the task `DROPPED`, increments `skipStreak`,
  calls `recycleRecurringTask` to create the next occurrence.
- **Windowed routines:** writes a `routineLog` row with `status: "missed"`
  for every window of the missed day, then marks the task `DROPPED`.

The cron is the only thing that produces these missed-state side effects.
If it stops firing, drift metrics, skip streaks, and routine logs all
silently break.

## Strategy: Lazy Per-User Sweep

Run the sweep **for one user, on demand,** the first time that user touches
a routine-related endpoint after their local midnight has passed. No
ticker, no global walker, no external trigger.

### Trigger points

The sweep runs at the top of these handlers (before their main work):

1. `GET /api/tasks/card-file` — the page that displays routine cards
2. `POST /api/routines/generate` — the "Load Today's Cards" button
3. `GET /api/insights/drift/sleep-performance` and any other drift/insights
   route that reads `routineLog` (audit during implementation)

The first two are sufficient for correctness from the user's POV — the
cards page is where missed state becomes visible. The third matters only
so drift dashboards don't show pre-sweep stale data.

### Tracking last sweep

Add a single field to track when each user was last swept:

```prisma
model User {
  // ...
  lastMissedSweepAt DateTime?
}
```

The sweep helper runs only if:

```
lastMissedSweepAt == null  ||  lastMissedSweepAt < startOfLocalToday(user.tz)
```

After a successful sweep, set `lastMissedSweepAt = now()`.

This guarantees: at most one sweep per user per local day, and no sweep at
all for users who never touch the app that day (which is fine — there's
nothing to display to them and the next time they show up, the sweep
catches everything they missed).

## Code Changes

### 1. Extract per-user sweep helper

Create `src/lib/services/recurring-missed-service.ts`:

```ts
export async function sweepMissedRoutinesForUser(
  userId: string,
  opts?: { force?: boolean }
): Promise<{ skipped: boolean; simpleMissed: number; windowedMissed: number }>
```

Body is the per-user equivalent of the existing cron loop:

- Look up `user.lastMissedSweepAt` and `notificationPreference.timezone`.
- Compute `startOfLocalToday` in the user's timezone.
- If `!opts.force && lastMissedSweepAt && lastMissedSweepAt >= startOfLocalToday`,
  return `{ skipped: true, ... }` immediately.
- Query `task.findMany({ where: { userId, routineId: { not: null }, status: { notIn: ["COMPLETED","DROPPED"] }, scheduledDate: { lt: startOfLocalToday } } })`.
- For each task, run the same simple-vs-windowed branch as the existing
  cron handler (lines 60–158 of `src/app/api/cron/recurring-missed/route.ts`).
- After the loop, `prisma.user.update({ where: { id: userId }, data: { lastMissedSweepAt: now } })`.
- Return counts.

The per-user query is materially cheaper than the cron's global query
because it's scoped by `userId` and by `scheduledDate < startOfLocalToday`,
both indexed.

### 2. Wire trigger points

In each trigger-point handler, after `requireAuth` and before the main
work:

```ts
import { sweepMissedRoutinesForUser } from "@/lib/services/recurring-missed-service";

// ... inside handler, after const { userId } = auth ...
await sweepMissedRoutinesForUser(userId);
```

The call is unconditional — the helper itself decides whether to do work
based on `lastMissedSweepAt`. Cost on a no-op call: one indexed `User`
read.

### 3. Leave the cron route in place

Per Jason's call, do **not** delete `src/app/api/cron/recurring-missed/route.ts`
in this spec. Refactor it to call `sweepMissedRoutinesForUser(userId, { force: true })`
in a loop over all users, so the external cron remains functional and
becomes a thin wrapper over the same code path. Removal is a follow-up
once we've confirmed the lazy path is doing its job.

### 4. Migration

```bash
npx prisma migrate dev --name add_user_last_missed_sweep_at
```

No data backfill needed — `null` is the correct initial state (forces a
sweep on next access).

## Edge Cases

- **User changes timezone mid-day.** The sweep uses whatever timezone is
  current at call time. Worst case: a user swept at 11pm ET, then changes
  to PT (now 8pm PT same calendar day) — `lastMissedSweepAt` is still
  >= startOfLocalToday in PT, sweep skipped. Correct.
- **User opens the app at 11:59pm and again at 12:01am local.** First call
  sweeps yesterday's missed tasks (if any). Second call: `lastMissedSweepAt`
  is now 11:59pm, which is `< startOfLocalToday` for the new day, so it
  sweeps again — picking up anything scheduled for the day that just ended
  but unfinished. Correct.
- **Concurrent requests from the same user crossing midnight.** Two
  parallel requests could both pass the `lastMissedSweepAt` check and both
  run the sweep. The sweep operations are idempotent at the task level
  (status update to DROPPED is a no-op the second time; routineLog has a
  unique constraint on `routineId_windowId_date` so the second create
  fails harmlessly — but we should wrap the create in a try/catch on
  P2002 to avoid noise). Acceptable; the duplicate work is bounded and
  rare.
- **User who never logs in.** Their stale routine tasks never get swept.
  This is fine for the in-app experience but means drift dashboards an
  admin views about that user would be stale. Out of scope for this spec
  — flag in the next spec if it matters for an admin tool.

## Testing

1. **Unit:** mock a user with `lastMissedSweepAt = null` and a stale
   routine task; assert sweep marks it DROPPED and sets the timestamp.
2. **Unit:** call sweep twice in a row; assert the second call is a no-op
   (`skipped: true`).
3. **Integration:** seed a user with one simple + one windowed routine,
   advance the clock past their local midnight, hit `GET /api/tasks/card-file`,
   assert old cards are DROPPED and `routineLog` rows exist for the
   windowed routine's missed windows.
4. **Manual on alpha:**
   - Create a routine, complete nothing, wait past midnight.
   - Visit Card File next morning — confirm yesterday's card is gone and
     skip streak incremented exactly once.
   - Trigger external cron manually too — confirm it still works (no-op
     for this user, may sweep others).

## Out of Scope (future specs)

- `notifications` cron — needs in-process scheduler (no triggering user).
- `trial` cron — daily tick, in-process scheduler.
- `retention` cron — daily tick, in-process scheduler.
- Removal of `/api/cron/recurring-missed/route.ts` after lazy path is
  proven in production.
- Horizontal scaling note: current Tandem deployment is one Node process
  per DB (per instance). In-process schedulers in future specs assume this
  invariant. **Do not run multiple Node processes against a single Tandem
  database** without first adding a leader-election lock.

## Feature Completeness Checklist

- [ ] `sweepMissedRoutinesForUser` helper created with unit tests
- [ ] `User.lastMissedSweepAt` migration written and applied
- [ ] Trigger points wired in `card-file` and `routines/generate` routes
- [ ] Existing `/api/cron/recurring-missed` refactored to use the helper
- [ ] Help doc updated if any user-facing behavior changes (it shouldn't)
- [ ] Tested on alpha across a midnight boundary
- [ ] CHANGELOG entry under v1.9
