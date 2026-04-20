# Security Review — v1.9 Features

**Date:** 2026-03-06
**Scope:** Calendar & Google Sync, Team Sync, Email Capture, Focus Timer, Task Duration, Time Audit, Admin Dashboard

---

## HIGH (5)

- [x] **H1 — Calendar: IDOR on recurring parent PATCH**
  `src/app/api/calendar/[id]/route.ts` L119-131
  `editScope=all` updates parent event by ID without verifying parent belongs to userId. Same pattern in DELETE at L192-196.
  **Fix:** Add `userId` to the where clause when updating/deleting parent events.

- [x] **H2 — Calendar: DELETE parent cascade bypasses ownership**
  `src/app/api/calendar/[id]/route.ts` L169, 195
  Deletes parent by ID alone without userId filter. Virtual case (L161-164) checks userId but non-virtual case does not.
  **Fix:** Always include userId in delete operations or verify ownership first.

- [x] **H3 — Team Sync: Thread GET has no team membership check**
  `src/app/api/threads/[id]/route.ts` L14
  Any authenticated user can read any thread by ID regardless of team membership.
  **Fix:** Resolve anchor team and call `assertTeamAccess(userId, teamId)` before returning data.

- [x] **H4 — Team Sync: Thread PATCH has no team membership check**
  `src/app/api/threads/[id]/route.ts` L48-62
  Any authenticated user can rename any thread.
  **Fix:** Resolve anchor team and check membership before allowing update.

- [x] **H5 — Team Sync: Decision GET has no team membership check**
  `src/app/api/decisions/[id]/route.ts` L13
  Any authenticated user can read full decision details (question, context, responses, respondent names).
  **Fix:** Resolve anchor team via thread and verify membership.

---

## MEDIUM (8)

- [x] **M1 — Team Sync: Thread list endpoints lack access check**
  `src/app/api/tasks/[id]/threads/route.ts` L15-18
  `src/app/api/projects/[id]/threads/route.ts` L15-18
  Lists threads for a task/project without verifying caller has access.
  **Fix:** Resolve anchor team and verify membership before listing.

- [x] **M2 — Team Sync: @-mention injection**
  `src/lib/services/thread-service.ts` L417-469
  `processMentions` accepts arbitrary user IDs without verifying targets are team members. Can spam any user with inbox items and push notifications.
  **Fix:** Look up team membership for each mentioned user and skip non-members.

- [x] **M3 — Team Sync: Decision respondents not validated as team members**
  `src/lib/services/decision-service.ts` L84-88
  `createDecision` accepts respondentIds without checking team membership. Creates inbox items for arbitrary users.
  **Fix:** Validate each respondent ID belongs to a member of the anchor team.

- [x] **M4 — Calendar: Missing Zod validation on PATCH calendars**
  `src/app/api/calendar/google/calendars/route.ts` L66-73
  Uses type assertion instead of Zod. `summary` and `color` stored without length limits.
  **Fix:** Create Zod schema with `.max()` constraints on string fields.

- [x] **M5 — Calendar: No ownership check on taskId/projectId at event creation**
  `src/app/api/calendar/route.ts` L169-183
  Accepts taskId/projectId without verifying they belong to the user. The time-block route correctly checks this.
  **Fix:** Verify taskId/projectId belongs to userId before creating event.

- [x] **M6 — Email: Webhook secret timing attack**
  `src/app/api/webhooks/email-inbound/route.ts` L13
  Uses `!==` instead of constant-time comparison. `timingSafeEqual` already used elsewhere in codebase.
  **Fix:** Use `crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(WEBHOOK_SECRET))` with length pre-check.

- [x] **M7 — Email: Rate limit leaks token validity**
  `src/app/api/webhooks/email-inbound/route.ts` L35-42
  Invalid tokens get 200, rate-limited valid tokens get 429. Attacker can distinguish valid/invalid tokens.
  **Fix:** Move rate limiting before token lookup, key by source IP. Or always return 200.

- [x] **M8 — Timer/Duration: No upper bound on minutes**
  `src/lib/validations/timer.ts` L8 — `adjustedMinutes` has no max
  `src/app/api/tasks/[id]/complete/route.ts` L22-24 — `actualMinutes` has no max
  **Fix:** Add `.max(1440)` (24hrs) to timer validation. Add max check and Zod schema to complete endpoint.

---

## LOW (13)

- [x] **L1 — Calendar: Task ID leaked to Google Calendar**
  `src/lib/google-calendar/sync-write.ts` L34
  Internal task UUID embedded in Google Calendar event description.
  **Fix:** Omit task ID or replace with task title.

- [x] **L2 — Calendar: No rate limiting on Google sync endpoints**
  Session-cookie users can spam Google API calls (sync, connect).
  **Fix:** Deferred — Google's own rate limiting provides protection. Can add per-user limiting later.

- [x] **L3 — Calendar: Internal error details exposed**
  `src/app/api/calendar/google/connect/route.ts` L44-46, `sync/route.ts` L16
  `err.message` returned to client in 500 responses.
  **Fix:** Return generic error message, log full error server-side.

- [x] **L4 — Calendar: Date fields not validated as dates**
  `src/lib/validations/calendar-event.ts` L6-8
  `date`, `startTime`, `endTime` validated as strings, not as valid ISO dates.
  **Fix:** Add `.refine()` or regex for ISO date format.

- [x] **L5 — Calendar: recurrenceRule accepts arbitrary strings**
  `src/lib/validations/calendar-event.ts` L13
  Free-form string passed to rrule parser and Google API.
  **Fix:** Validate RRULE syntax (starts with `FREQ=`, allowed parameters only).

- [x] **L6 — Calendar: Google event data stored without HTML sanitization**
  `src/lib/google-calendar/sync-read.ts` L48-49
  `summary` and `description` from Google stored as-is. Low risk since React auto-escapes.
  **Fix:** Strip HTML tags from description before storing.

- [x] **L7 — Calendar: excludedDates array grows unbounded**
  `src/app/api/calendar/[id]/route.ts` L174-179, 205-209
  Each "delete this instance" appends to JSON array with no cap.
  **Fix:** Add cap (e.g., 365 entries).

- [x] **L8 — Calendar: Sync errors silently swallowed**
  `src/app/api/calendar/route.ts` L186, `[id]/route.ts` L80, 129, 142
  `.catch(() => {})` loses all error context.
  **Fix:** Log errors: `.catch((err) => console.error("[google-calendar] sync failed:", err))`.

- [x] **L9 — Team Sync: Unbounded mentions/respondentIds arrays**
  `src/lib/validations/thread.ts` L9, `decision.ts` L8
  No `.max()` on arrays. Could cause massive DB writes.
  **Fix:** Add `.max(50)` to both arrays.

- [x] **L10 — Team Sync: Thread DELETE only checks creator**
  `src/app/api/threads/[id]/route.ts` L73-83
  Removed team members can still delete threads they created.
  **Fix:** Add team membership check before allowing deletion.

- [x] **L11 — Email: Token entropy 72 bits**
  `src/app/api/settings/email-capture/route.ts` L7
  `crypto.randomBytes(9)` — recommend 128 bits (16 bytes).
  **Fix:** Change to `crypto.randomBytes(16).toString("base64url")`.

- [x] **L12 — Time Audit: No validation intervalEnd > intervalStart**
  `src/app/api/time-audit/[id]/entries/route.ts` L26-30
  Can create entries where end is before start, producing negative durations.
  **Fix:** Add `if (intervalEnd <= intervalStart) return badRequest(...)`.

- [x] **L13 — Timer: JSON parse failure not caught in start route**
  `src/app/api/timer/start/route.ts` L11
  `req.json()` not wrapped in try/catch. Returns 500 instead of 400.
  **Fix:** Wrap in try/catch like the stop route does.
