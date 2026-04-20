# Task Duration Tracking (Phase 1) — Test Plan

## Prerequisites
- A task with an estimated time set (e.g., 30 minutes)
- A task without an estimated time set
- MCP client connected (for MCP tests)

## Completion Prompt Tests

### ActualTimePrompt — Do Now Page
- [ ] Complete a task WITH an estimate → prompt appears inline above the task list
- [ ] Complete a task WITHOUT an estimate → no prompt appears
- [ ] Prompt shows "How long did this actually take?" with estimate reference
- [ ] Quick-tap chips show values relative to estimate (50%, 100%, 150%, 200%, 250%, 300%+)
  - For 30m estimate: 15m, 30m, 45m, 1h, 1h 15m, 1h 30m+
- [ ] The 100% chip (matching estimate) has a subtle highlight (border-primary)
- [ ] Clicking a chip submits the value and dismisses the prompt
- [ ] "Other..." button reveals a freeform minute input
- [ ] Custom input accepts positive integers and submits on Enter
- [ ] Skip (X) button dismisses without recording
- [ ] Prompt auto-dismisses after 15 seconds of inactivity
- [ ] Only one prompt shows at a time (completing another task replaces it)

### Data Persistence
- [ ] After submitting actual time, the task's `actualMinutes` field is updated in the database
- [ ] The PATCH request sends `{ id, actualMinutes }` to `/api/tasks/:id`

## Actual Time Display Tests

### TaskCard (Do Now page)
- [ ] Completed task with both estimatedMins and actualMinutes shows actual time badge
- [ ] Badge color: green when actual is within +/-10% of estimate
- [ ] Badge color: blue when actual is under 90% of estimate (faster than expected)
- [ ] Badge color: amber when actual is over 110% of estimate (slower than expected)
- [ ] Badge has tooltip showing "Actual: Xm vs est. Ym"
- [ ] Display works on both desktop (inline) and mobile (second line)
- [ ] Task with estimate but no actualMinutes shows only the estimate badge

### ProjectTaskItem (Project detail page)
- [ ] Same actual time badge appears next to estimate in project task list
- [ ] Color coding matches TaskCard behavior

## API Tests

### PATCH /api/tasks/:id
- [ ] Sending `{ id, actualMinutes: 25 }` updates the field
- [ ] Sending `{ id, actualMinutes: null }` clears the field
- [ ] Field validated as positive integer

### POST /api/tasks/:id/complete
- [ ] Sending `{ version, actualMinutes: 45 }` sets actualMinutes on the completed task
- [ ] Sending without actualMinutes leaves it null (existing behavior)

## MCP Tool Tests

### tandem_task_complete
- [ ] Tool schema includes optional `actualMinutes` parameter
- [ ] Calling with `{ taskId: "...", actualMinutes: 30 }` records the value
- [ ] Calling without `actualMinutes` works as before

### tandem_task_update
- [ ] Tool schema includes optional `actualMinutes` parameter
- [ ] Calling with `{ taskId: "...", actualMinutes: 45 }` updates the value
- [ ] Calling with `{ taskId: "...", actualMinutes: 0 }` clears the value

## Edge Cases
- [ ] Completing a task via swipe (mobile) with estimate → prompt still appears
- [ ] Completing a team task (with completion note dialog) that has estimate → prompt appears after dialog
- [ ] Very large estimate (e.g., 480m/8h) → chips show reasonable values (4h, 8h, 12h, etc.)
- [ ] Very small estimate (e.g., 5m) → chips show reasonable values (3m, 5m, 8m, 10m, etc.)
