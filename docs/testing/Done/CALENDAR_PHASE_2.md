# Calendar Phase 2 — Test Plan

Test on alpha (alpha.tandemgtd.com). Requires a connected Google account with calendar access.

---

## Prerequisites

- [ ] Run migration: `npx prisma migrate deploy`
- [ ] Run `npx prisma generate`
- [ ] Restart service
- [ ] Google Calendar already connected from Phase 1 (Settings > Google Calendar shows "Connected")

---

## 2A: Google Calendar Read Sync

### Calendar Selection (Settings)

- [ ] Open Settings > Google Calendar > expand
- [ ] "Import External Calendars" section visible with calendar list
- [ ] Each Google Calendar shows name, color swatch, checkbox
- [ ] Primary calendar labeled "(primary)"
- [ ] Enable one calendar — toast confirms "Calendar enabled"
- [ ] Disable it — checkbox unchecks, no error

### Read Sync

- [ ] With at least one calendar enabled, click "Sync Now"
- [ ] Toast shows "Sync complete" with upserted/removed counts
- [ ] "Last imported" timestamp updates
- [ ] Click "Sync Now" again within 5 minutes — toast says "Sync skipped" (debounce)

### External Events Display — Sidebar

- [ ] Open Calendar sidebar — external events appear with purple styling
- [ ] External events show small link icon before title
- [ ] Click an external event — nothing happens (no edit dialog opens)
- [ ] Regular Tandem events still open the edit dialog normally

### External Events Display — Full Page

- [ ] Navigate to /calendar — external events appear in all views (day/week/month)
- [ ] External events show purple styling in day and week views
- [ ] Click external event — no edit dialog

### External Events Read-Only Protection

- [ ] Attempt to edit an external event via API (PATCH) — returns "External calendar events are read-only"
- [ ] Attempt to delete an external event via API (DELETE) — returns same error

### Auto-Refresh

- [ ] Open sidebar, wait 15+ minutes — events auto-refresh (check network tab)

---

## 2B: Weekly Review Calendar Steps

### Review Calendar Panels

- [ ] Start a weekly review, navigate to "Get Current" step
- [ ] Calendar checklist items show "View" button on the right
- [ ] Click "View" on "Review past calendar" — panel expands showing last 7 days of events
- [ ] Events grouped by day with date headers (e.g. "Yesterday — Wed, Mar 4")
- [ ] External events show purple link icon
- [ ] Click "View" on "Review upcoming calendar" — panel expands showing next 14 days
- [ ] Click "Hide" — panel collapses

### Follow-Up to Inbox

- [ ] Hover over an event in the review panel — "+" button appears
- [ ] Click "+" — toast confirms "Added to inbox"
- [ ] Navigate to Inbox — item exists with title "Follow up: {event title}"

### Read Sync Trigger

- [ ] On entering "Get Current" step, a read sync is triggered (fire-and-forget)
- [ ] If Google Calendar connected, events should be fresh

### Empty States

- [ ] If no events in date range, panel shows "No events in the past 7 days" / "next 14 days"

---

## 2C: Recurring Calendar Events

### Creating Recurring Events

- [ ] Open New Event dialog (sidebar or full page)
- [ ] "Repeat" dropdown appears after Reminder field
- [ ] Default is "Does not repeat"
- [ ] Select "Daily" — event created with `recurrenceRule: "FREQ=DAILY"`
- [ ] Select "Weekly" — `FREQ=WEEKLY`
- [ ] Select "Every 2 weeks" — `FREQ=WEEKLY;INTERVAL=2`
- [ ] Select "Monthly" — `FREQ=MONTHLY`

### Custom Recurrence

- [ ] Select "Custom..." — expanded settings panel appears
- [ ] Frequency dropdown (Daily/Weekly/Monthly/Yearly)
- [ ] Interval input ("Every N")
- [ ] When Weekly: day checkboxes appear (S M T W T F S) — toggle days
- [ ] Ends: Never / After N occurrences / On date
- [ ] Set "After 5 occurrences" — rule includes `COUNT=5`
- [ ] Set "On date" — rule includes `UNTIL=...`

### Recurring Event Display

- [ ] Create a weekly recurring event starting today
- [ ] Switch to week view — event appears on the correct day
- [ ] Switch to next week — same event appears on the same day
- [ ] Day view shows the recurring instance at the correct time

### Edit This Occurrence

- [ ] Click a recurring instance — edit dialog opens
- [ ] Change the title, save with `?editScope=this`
- [ ] Only that occurrence shows the new title
- [ ] Other occurrences keep the original title
- [ ] Verify: a materialized exception was created in the DB

### Edit All Occurrences

- [ ] Click a recurring instance, edit with `?editScope=all`
- [ ] All occurrences update to the new values

### Delete This Occurrence

- [ ] Delete a recurring instance with `?deleteScope=this`
- [ ] That date disappears from the calendar
- [ ] Other occurrences remain
- [ ] Verify: date added to parent's `excludedDates` array

### Delete All Occurrences

- [ ] Delete a recurring instance with `?deleteScope=all`
- [ ] All occurrences disappear
- [ ] Parent event deleted from DB (cascades to any materialized exceptions)

### Google Calendar Sync

- [ ] Create a recurring event with Google sync enabled
- [ ] Check Google Calendar — event appears with correct recurrence
- [ ] Edit the parent — Google event updates
- [ ] Delete the parent — Google event removed

---

## Edge Cases

- [ ] Create recurring event, exclude several dates, verify remaining occurrences are correct
- [ ] External recurring events from Google show as individual instances (singleEvents=true in read sync)
- [ ] Calendar selection persists across page reloads (watchedCalendars stored in DB)
- [ ] Disconnect Google Calendar — external events remain but no new syncs
- [ ] Reconnect and re-sync — events update correctly
