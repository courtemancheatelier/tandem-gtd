# JMC Testing TODO

## Open Items

- [ ] **Google OAuth Verification** — Submitted updated scope justification Mar 7. Trust & Safety review takes 4-6 weeks (expect first email by ~Mar 12). Must be approved before moving off alpha to production. Check email for updates.

## Admin Usage Dashboard
> Test plan: `docs/testing/ADMIN_USAGE_DASHBOARD.md`

- [ ] Navigate to Settings > Admin > Usage tab — verify it appears
- [ ] Expand the Usage Dashboard card — verify data loads
- [ ] Check 5 summary cards show correct aggregate values
- [ ] Check user table shows all users with engagement badges
- [ ] Verify sorting works on all columns
- [ ] Verify engagement colors: Active (green), New (blue), Drifting (yellow), Dormant (gray)
- [ ] Check setup indicators (contexts/areas/goals/horizons) show green when configured
- [ ] Test with a non-admin user — verify 403

## Task Duration Tracking (Phase 1)
> Test plan: `docs/testing/TASK_DURATION_TRACKING.md`

- [ ] Complete a task WITH an estimate on Do Now — verify prompt appears
- [ ] Complete a task WITHOUT an estimate — verify NO prompt appears
- [ ] Click a quick-tap chip — verify actualMinutes is saved
- [ ] Click "Other..." and enter a custom value — verify it saves
- [ ] Click X to skip — verify prompt dismisses, no value saved
- [ ] Wait 15 seconds — verify prompt auto-dismisses
- [ ] Check actual time badge appears on TaskCard (green/blue/amber coloring)
- [ ] Check actual time badge appears on ProjectTaskItem
- [ ] MCP: `tandem_task_complete` with `actualMinutes` param — verify it records
- [ ] MCP: `tandem_task_update` with `actualMinutes` param — verify it updates

## Time Audit Challenge (Phase 1)
> Test plan: `docs/testing/TIME_AUDIT_CHALLENGE.md`

- [ ] Navigate to Reflect > Time Audit in sidebar — page loads
- [ ] Start a challenge — dialog with start/end time, creates successfully
- [ ] Log entries with quick tags — entries appear in timeline
- [ ] Link a task to an entry — task title shows in timeline
- [ ] Edit an entry's tags inline — saves correctly
- [ ] Delete an entry — removed from timeline
- [ ] Pause/Resume challenge — status toggles, paused message shows
- [ ] End challenge — summary generates with chart, alignment score, energy map, observations
- [ ] View past challenge from history — summary displays correctly
- [ ] Active challenge bar appears at top of all pages during active challenge
- [ ] Delete a challenge from history — removed with all entries

## Commitment Drift Dashboard (Phases 1–3)
> Spec: `docs/specs/COMMITMENT_DRIFT.md`

### Setup
- [ ] Run migration: `npx prisma migrate deploy`
- [ ] Run backfill: `npx tsx prisma/backfill-drift.ts`
- [ ] Verify Prisma client has new fields (User + Task drift columns)

### Navigation
- [ ] Sidebar: "Drift" link appears in Reflect section with TrendingDown icon
- [ ] Click it — navigates to /drift, page loads

### Window Selector
- [ ] Default window is "This Week"
- [ ] Switch to Last Week / This Month / YTD — data refreshes for each
- [ ] Verify charts update when toggling windows

### Completions Widget
- [ ] Bar chart renders with current period data
- [ ] Prior period bars show as muted overlay
- [ ] Trend indicator shows % change vs prior (green = positive)
- [ ] Empty state shows "No completions in this period" message

### Deferrals Widget
- [ ] Bar chart renders with current period deferral data
- [ ] Includes both scheduledDate deferrals and forward due-date pushes
- [ ] Decrease vs prior shows as green (positive framing)

### Completion Heatmap
- [ ] CSS grid shows 7 days × 12 two-hour blocks
- [ ] Cells colored by intensity (neutral → deep blue)
- [ ] Hover shows tooltip with day, time block, count
- [ ] Empty state handled gracefully

### Drift by Area
- [ ] One card per area with drift score (0–100)
- [ ] Sparkline shows 8-week trend
- [ ] Color scale: gray (0) → amber → orange → red
- [ ] Areas sorted by drift score descending
- [ ] Shows drifted task count per area

### Most Deferred Table
- [ ] Table shows tasks with deferralCount > 0
- [ ] Columns: Task, Area, Project, Deferrals, Pushes, Drift Days, Status, Signal
- [ ] Default sort by Deferrals desc
- [ ] Click column headers to re-sort (toggles asc/desc)
- [ ] "Break down" signal shows for tasks ≥ threshold (default 4)
- [ ] Responsive: some columns hide on smaller screens

### Displacement Lens
- [ ] Only shows tasks with 3+ deferrals
- [ ] Click to expand — loads displacement data for that task
- [ ] Each deferral date shows what was completed that same day
- [ ] "Most displaced by" area summary appears at bottom
- [ ] Empty state when no tasks qualify

### Counter Maintenance (ongoing)
- [ ] Defer a task (set scheduledDate) — deferralCount increments
- [ ] Push a due date forward — dueDatePushCount increments, originalDueDate set on first push
- [ ] Complete a task with originalDueDate — totalDriftDays finalized
- [ ] Verify counters survive page refresh (persisted in DB)

### Feature Gating
- [ ] User with driftDashboardEnabled=false gets 403 on all drift APIs
- [ ] User with driftDisplacementEnabled=false gets 403 on displacement endpoint

## ~~Calendar Phase 2 — Read Sync, Weekly Review, Recurring Events~~ DONE
> Test plan: `docs/testing/CALENDAR_PHASE_2.md`
> Tested on alpha 2026-03-06

### Quick Smoke Test
- [x] Settings > Google Calendar > enable an external calendar > Sync Now — events import
- [x] Calendar sidebar shows external events in purple with link icon
- [x] External events are read-only (clicking opens Google Calendar)
- [x] Weekly Review > Get Current > click "View" on calendar items — events expand inline
- [x] Click "+" on a review event — follow-up added to inbox
- [x] Create a recurring event (Weekly) — instances appear across weeks
- [x] Delete "this occurrence" — only that date removed
- [x] Delete "all occurrences" — entire series removed
- [x] Create recurring event with Google sync — check Google Calendar has RRULE
- [x] Drag-to-move and drag-to-resize events in day and week views (15-min snap)
- [x] Task due dates show on calendar as red deadline entries
- [x] Full 24-hour range (12 AM – 11 PM)
- [x] Time picker with 15-min intervals and double-click-to-type
- [x] Manual sync button with force refresh
