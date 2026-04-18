# v1.9 Test Plan — Alpha Testing Checklist

Test on **alpha.tandemgtd.com**. Check each item as you verify it works.

---

## 1. Decision Proposals Phase 2

### Quick Poll Auto-Resolve
- [ ] Create a QUICK_POLL from a team project (three-way toggle: Decision / Poll / Quick Poll)
- [ ] Add at least 2 options and 2 respondents
- [ ] Have each respondent vote via the decision detail page
- [ ] Verify the poll auto-resolves when all votes are in (winning option selected, status → RESOLVED)
- [ ] Verify tied polls stay open for the owner to resolve manually

### Task Auto-Generation
- [ ] Create any decision (APPROVAL, POLL, or QUICK_POLL) with respondents
- [ ] Check each respondent's Do Now — they should have a task like "Vote on: ..." or "Review and approve: ..."
- [ ] Task should have energy: LOW, estimated: 5m, due date matching the decision deadline
- [ ] Submit a response/vote — verify the respondent's task auto-completes
- [ ] Resolve or withdraw the decision — verify any remaining respondent tasks auto-complete

### Contributions
- [ ] Open an OPEN decision's detail page
- [ ] Scroll to the "Contributions" section
- [ ] Submit a contribution (freeform text)
- [ ] Verify it appears with your name and timestamp
- [ ] Submit another — verify ordering is chronological
- [ ] Verify the contributions section is hidden on resolved decisions (no input form, but existing contributions still show)

---

## 2. Microsoft Outlook/365 Calendar Sync

### Connection
- [ ] Go to Settings > Data — verify "Microsoft Outlook" section appears below Google Calendar
- [ ] If no Microsoft account linked, verify it shows "Make sure you have a Microsoft account linked"
- [ ] Link a Microsoft account via Settings > Linked Accounts (if not already)
- [ ] Click "Connect Microsoft Calendar" — verify it connects successfully
- [ ] Verify the Connected badge appears

### Calendar Selection
- [ ] Expand the Microsoft Outlook section — verify your Outlook calendars are listed
- [ ] Toggle a calendar on/off — verify toast confirms the change
- [ ] Default calendar should be pre-selected

### Read Sync (Import)
- [ ] Click "Sync Now" — verify events are imported from enabled calendars
- [ ] Check the calendar view — Outlook events should appear with their colors
- [ ] Verify the "Last imported" timestamp updates

### Write Sync (Push)
- [ ] Create a calendar event in Tandem
- [ ] Trigger sync — verify it appears in your Outlook calendar
- [ ] *(Note: write sync may require triggering via the Sync/Retry button)*

### Disconnect
- [ ] Click "Disconnect Microsoft Calendar"
- [ ] Verify imported events are removed from Tandem
- [ ] Verify the section reverts to "Not connected" state

---

## 3. Estimation Accuracy Dashboard

### Prerequisites
- Complete a few tasks that have BOTH an estimated time AND actual time recorded

### Widget
- [ ] Go to Insights page
- [ ] Expand the "Efficiency" section
- [ ] Verify the "Estimation Accuracy" widget appears
- [ ] Verify the accuracy percentage shows in the top right corner

### Tabs
- [ ] **Distribution tab** — horizontal bar chart showing task counts per accuracy bucket (Under 50%, 50-75%, 75-100%, etc.)
- [ ] Green bars for accurate range (75-150%), amber for inaccurate
- [ ] **Trend tab** — line chart showing weekly avg accuracy with a dashed "Perfect" reference line at 100%
- [ ] **By Size tab** — bar chart showing accuracy per estimate size (Quick ≤15m, Short 16-30m, etc.)
- [ ] Each bar colored by accuracy (green = close to 100%, amber/red = off)

### Edge Cases
- [ ] If no tasks have both estimated and actual time → widget should not appear
- [ ] Verify the time range selector (30d / 90d / 1y / All) affects the data

---

## 4. Focus Timer

- [ ] Open a task card — verify a timer section or start button exists
- [ ] Start the timer — verify the floating pill appears
- [ ] Pause and resume — verify time tracking continues correctly
- [ ] Stop the timer — verify the session is recorded
- [ ] Start another session on the same task — verify cumulative time shown
- [ ] Let a timer run for a long time (or check code) — verify the 4-hour runaway dialog would trigger
- [ ] Complete the task — verify actualMinutes is pre-filled from timer sessions

---

## 5. Task Duration Tracking

- [ ] Complete a task that has an estimated time
- [ ] Verify the "How long did this actually take?" prompt appears
- [ ] Test the quick-tap buttons (0.5x, 1x, 1.5x, 2x, 2.5x, 3x+ of estimate)
- [ ] Test the custom input field
- [ ] Verify the actual time is saved on the task
- [ ] Complete a task WITH an active timer — verify the prompt pre-fills from the timer

---

## 6. Time Audit Challenge

- [ ] Navigate to the Time Audit page
- [ ] Start a new challenge
- [ ] Log a few 15-minute time entries with tags
- [ ] Complete or end the challenge
- [ ] Verify the summary shows:
  - [ ] GTD alignment score
  - [ ] Energy map visualization
  - [ ] Category breakdown
- [ ] Check challenge history — verify past challenges appear

---

## 7. Time Blocking

- [ ] Go to the Calendar page (Day or Week view)
- [ ] Drag a task from the Do Now sidebar onto the calendar
- [ ] Verify a time block is created at the drop position
- [ ] Drag an existing event to a different time slot — verify it moves (15-min snap)
- [ ] Drag the bottom edge of an event — verify it resizes (15-min snap)
- [ ] Verify the time block creates/updates a CalendarEvent with eventType TIME_BLOCK

---

## 8. Mobile Polish (test on phone or responsive mode)

### Swipe-to-Complete
- [ ] Open Do Now on a touch device (or use browser responsive mode)
- [ ] Swipe right on a task card — verify green background reveals with checkmark
- [ ] Complete the swipe — verify the task completes and a toast appears
- [ ] Swipe partially and release — verify it snaps back (threshold not met)

### Pull-to-Refresh
- [ ] Scroll to the top of Do Now
- [ ] Pull down — verify a spinner/indicator appears
- [ ] Release — verify the data refreshes

### Haptic Feedback
- [ ] On a device that supports vibration, complete a task
- [ ] Verify a brief vibration occurs on completion

### Offline Indicator
- [ ] Disconnect from the internet (airplane mode or disable WiFi)
- [ ] Verify an amber banner appears: "You're offline"
- [ ] Reconnect — verify the banner updates to "Back online" and dismisses

---

## 9. Email-to-Inbox Capture

### Setup
- [ ] Go to Settings — find the Email Capture section
- [ ] Enable email capture — verify a unique inbox address is generated
- [ ] Copy the address to clipboard — verify it copies correctly

### Capture Flow
- [ ] Forward an email to the inbox address
- [ ] Check your Tandem inbox — verify a new item appears
- [ ] Verify the item shows the email subject as content
- [ ] Verify the item shows "via email from sender@..." badge
- [ ] Verify the email body appears in the notes

### Regenerate
- [ ] Click "Regenerate Address"
- [ ] Confirm the warning dialog
- [ ] Verify a new address is generated
- [ ] *(Old address should stop working)*

---

## 10. Previously Shipped Features (Spot Check)

These were already shipped but verify they still work after the new changes:

- [ ] **Routine Cards** — check a routine, verify window timing, compliance dashboard
- [ ] **Card File** — verify recurring tasks recycle correctly with timezone support
- [ ] **Commitment Drift** — open the drift dashboard, verify charts load
- [ ] **Decision Phase 1** — create an APPROVAL decision, vote, resolve, verify wiki update
- [ ] **Thread Search** — Cmd+K, search for a thread title, verify results appear
- [ ] **Calendar Sync (Google)** — verify Google Calendar still connects and syncs

---

## Notes

- **Alpha URL:** alpha.tandemgtd.com
- **Testing date:** March 14, 2026
- **Branch:** main (commit a4d2fb7)
- **Migrations to apply:** `decision_proposals_phase2`, `microsoft_calendar`
