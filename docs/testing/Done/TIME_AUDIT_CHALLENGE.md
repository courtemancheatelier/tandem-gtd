# Time Audit Challenge (Phase 1) — Test Plan

## Prerequisites
- Logged-in user account
- Migration applied (`npx prisma migrate dev` or `npx prisma migrate deploy`)

## Starting a Challenge

### Start Dialog
- [ ] Navigate to Time Audit via sidebar (Reflect > Time Audit)
- [ ] Click "Start Challenge" — dialog appears with start/end time pickers
- [ ] Default start time is next 15-minute mark, end time is +16h
- [ ] Adjust times and click "Start Challenge" — challenge created, redirects to logger
- [ ] Try to start a second challenge while one is active — error "You already have an active challenge"

## Entry Logger

### Quick Tags
- [ ] All 12 quick tags display with emoji + label
- [ ] Tapping a tag toggles selection (highlighted border)
- [ ] Multiple tags can be selected simultaneously
- [ ] "Log It" button disabled when no tags selected

### Logging an Entry
- [ ] Select tag(s), click "Log It" — entry appears in timeline below
- [ ] Add an optional note — note text shows in timeline entry
- [ ] Click "Link to task" — search input appears
- [ ] Type 2+ chars in task search — results appear after debounce
- [ ] Select a task — badge shows linked task title
- [ ] Click X on task badge to unlink
- [ ] Log entry with task linked — task title visible in timeline

### Timeline (ChallengeDayView)
- [ ] Logged slots show tag emojis, note preview, and linked task
- [ ] Empty (past) slots show dashed border with "Tap to fill in..." text
- [ ] Tapping an empty slot quick-logs it as "task_work"
- [ ] Edit button on entry — inline tag editor with save/cancel
- [ ] Delete button on entry — removes entry, slot becomes empty
- [ ] Entries show newest-first ordering
- [ ] Count "X/Y intervals logged" updates after each log

### Challenge Controls
- [ ] Pause button — challenge status changes to PAUSED, logger shows paused message
- [ ] Resume button — challenge resumes, can log again
- [ ] End button — challenge completes, summary generates (if enough entries), redirects to summary view
- [ ] Time remaining counter shows correct hours/minutes left

## Active Challenge Bar

- [ ] When challenge is active, thin bar appears at top of all pages
- [ ] Bar shows clock icon, "Time Audit Active", time remaining
- [ ] "Log Now" button navigates to /time-audit page
- [ ] Bar disappears when challenge ends
- [ ] Bar visible on both desktop and mobile layouts

## Challenge History

### Past Challenges List
- [ ] After ending a challenge, it appears in history list
- [ ] Card shows date, duration, entry count, completion %, status badge
- [ ] "completed" badge for finished challenges, "abandoned" for abandoned
- [ ] Click "View Summary" — navigates to summary view
- [ ] Delete button removes challenge from history
- [ ] "Back" button from summary returns to main page

## Summary View

### Overview Stats
- [ ] Shows total time logged, interval count, completion %, activity count
- [ ] Values match the actual logged data

### Time Distribution Chart
- [ ] Donut chart renders with colored segments per tag category
- [ ] Legend shows all logged tags
- [ ] Detail list below chart shows each tag with time and percentage
- [ ] Tooltip on hover shows formatted time (e.g., "2h 15m")

### GTD Alignment Score
- [ ] Raw alignment bar shows "X% of your time was linked to tasks"
- [ ] Adjusted alignment bar shows "X% of work time" (excluding maintenance)
- [ ] Explanatory text mentions maintenance intervals excluded
- [ ] Both bars render with correct fill widths

### Energy Pattern (Heatmap)
- [ ] Horizontal stacked bars for each hour of the challenge
- [ ] Colors match category: productive (green), reactive (orange), maintenance (gray), untracked (purple)
- [ ] Legend shows all four categories
- [ ] Bars scale relative to the busiest hour

### Observations
- [ ] Longest focus block observation shows if task_work entries exist
- [ ] Most common tag observation shows top activity
- [ ] Scrolling pattern observation shows if 3+ phone_scroll entries
- [ ] Unlinked thinking observation shows if thinking entries without task links
- [ ] All observations use neutral, non-judgmental language

## Edge Cases
- [ ] End challenge with fewer than 8 entries — summary endpoint returns error, no summary cached
- [ ] End challenge with exactly 8 entries — summary generates successfully
- [ ] Abandon challenge (vs. complete) — no summary generated
- [ ] Delete challenge — all entries cascade-deleted
- [ ] Page refresh during active challenge — logger reloads correctly
- [ ] Multiple browser tabs — active challenge detected consistently

## API Smoke Tests
- [ ] `GET /api/time-audit/active` returns 204 when no active challenge
- [ ] `POST /api/time-audit` creates challenge, returns 201
- [ ] `GET /api/time-audit/active` returns challenge JSON when active
- [ ] `POST /api/time-audit/:id/entries` creates entry, returns 201
- [ ] `GET /api/time-audit/:id/entries` returns ordered entry list
- [ ] `PATCH /api/time-audit/:id` with `{ status: "PAUSED" }` pauses
- [ ] `PATCH /api/time-audit/:id` with `{ status: "ACTIVE" }` resumes
- [ ] `PATCH /api/time-audit/:id` with `{ status: "COMPLETED" }` completes + generates summary
- [ ] `GET /api/time-audit/:id/summary` returns summary JSON
- [ ] `DELETE /api/time-audit/:id/entries/:entryId` deletes entry
- [ ] `GET /api/time-audit` returns history list with entry counts

## Nav
- [ ] "Time Audit" link appears in Reflect section of sidebar
- [ ] Timer icon displays correctly
- [ ] Link highlights when on /time-audit page
