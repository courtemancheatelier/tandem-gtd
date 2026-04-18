# Drag-and-Drop Time Blocking — Test Plan

Test on alpha (alpha.tandemgtd.com). Requires at least one task with an estimated time set.

---

## Prerequisites

1. Have the calendar sidebar available (desktop only — drag handles are hidden on mobile)
2. Have at least 2 tasks in Do Now, one with an estimated time (e.g. 30m) and one without
3. Have at least one project with tasks (for ProjectTaskItem testing)

---

## TaskCard Drag Handle (Do Now page)

### Drag handle visibility
- [ ] On desktop, each non-completed task card shows a calendar icon (CalendarDays) to the left of the expand chevron
- [ ] Completed tasks do NOT show the drag handle
- [ ] On mobile, the drag handle is hidden (resize browser to verify)

### Drag starts correctly
- [ ] Hover the calendar icon — cursor changes to grab
- [ ] Start dragging — cursor changes to grabbing
- [ ] Calendar sidebar auto-opens and switches to Day view (even if it was closed or on week/month view)
- [ ] Clicking the calendar icon does NOT expand/collapse the task card

---

## ProjectTaskItem Drag Handle (Project Detail page)

### Drag handle visibility
- [ ] Navigate to a project detail page with active tasks
- [ ] Each non-completed task shows a small CalendarDays icon after the GripVertical reorder handle
- [ ] Completed/dropped tasks do NOT show the calendar drag handle
- [ ] On mobile, the calendar drag handle is hidden

### No conflict with reorder drag
- [ ] If in reorder mode, dragging the GripVertical handle still reorders tasks normally
- [ ] Dragging the CalendarDays handle does NOT trigger reorder — it starts a calendar drag instead

---

## Day View Drop Zones

### Dropping a task with estimated time
- [ ] Drag a task (with estimatedMins = 30) from Do Now onto a specific hour slot in Day view
- [ ] The hovered slot highlights with a light primary color and shows "Drop to block" text
- [ ] Drop the task — a toast appears confirming "Time block created" with the task title and time
- [ ] The calendar refreshes and shows the new TIME_BLOCK event at the dropped hour
- [ ] The event duration matches the task's estimated time (30 min)

### Dropping a task without estimated time
- [ ] Drag a task with no estimated time onto a Day view hour slot
- [ ] Drop it — time block is created with a default 60 minute duration
- [ ] Verify the event shows as 1 hour in the calendar

### Visual feedback
- [ ] While dragging over a slot, only the hovered slot highlights (not others)
- [ ] Dragging away from a slot removes the highlight
- [ ] Dropping outside a valid slot does nothing (no error, no toast)

---

## Week View Drop Zones

### Dropping on a day column
- [ ] Switch calendar to Week view
- [ ] Drag a task from Do Now onto a day column
- [ ] The hovered day highlights with primary color
- [ ] Drop the task — time block is created at 9:00 AM on that day
- [ ] Toast confirms creation, calendar refreshes

### Visual feedback
- [ ] "Drop here" text appears in empty day columns while dragging over them
- [ ] Highlight clears when dragging away

---

## Sidebar Auto-Open Behavior

### Sidebar was closed
- [ ] Close the calendar sidebar
- [ ] Start dragging a task card's calendar icon
- [ ] Sidebar opens automatically and shows Day view

### Sidebar was on a different view
- [ ] Open sidebar and switch to Month view
- [ ] Start dragging a task — sidebar switches to Day view
- [ ] The view preference persists (localStorage) after the switch

---

## Edge Cases

### Multiple drops
- [ ] Drag and drop the same task to two different time slots — both time blocks are created (this is expected behavior, same as the Block Time popover)

### Error handling
- [ ] If the API fails (e.g. network error), a destructive toast appears saying "Failed to create time block"

### Existing features unaffected
- [ ] Swipe-to-complete on mobile still works normally on TaskCard
- [ ] Clicking hour slots in Day view still opens the new event dialog
- [ ] Clicking days in Week view still navigates to Day view
- [ ] The "Block Time" popover in the expanded TaskCard section still works
