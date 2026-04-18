# Focus Timer — Test Plan

**Feature branch:** `feat/focus-timer`
**Spec:** `docs/specs/FOCUS_TIMER.md`
**Date:** 2026-03-07

---

## Prerequisites

- Migration applied: `npx prisma migrate deploy`
- App running on alpha

---

## 1. Start Timer

- [ ] Expand a task in Do Now → "Timer" section visible with "Start Timer" button
- [ ] Click "Start Timer" → floating pill appears in bottom-left showing task title + "0 min"
- [ ] Navigate to a different page → pill persists
- [ ] Wait ~1 minute → pill updates to "1 min"

## 2. Pause / Resume

- [ ] Click pause button on pill → pill shows ⏸ icon, elapsed freezes
- [ ] Refresh the page → paused session survives (pill reappears in paused state)
- [ ] Click resume → pill shows ● again, counting resumes from accumulated time
- [ ] Verify accumulated time is correct (pause for 2 min, resume, total should be continuous)

## 3. Stop Timer

- [ ] Click stop button on pill → pill disappears
- [ ] Expand the same task → "Timer" section shows "X min across 1 previous session"
- [ ] Start and stop again → shows "X min across 2 previous sessions"

## 4. Auto-Pause on Task Switch

- [ ] Start timer on Task A → pill shows Task A
- [ ] Expand Task B → click "Start Timer" (should show hint: "Will pause timer on Task A")
- [ ] Click Start Timer on Task B → pill switches to Task B
- [ ] Expand Task A → shows accumulated time from previous session

## 5. Timer in Expanded TaskCard

- [ ] No active session → shows "Start Timer" button
- [ ] This task running → shows elapsed time + Pause/Stop buttons
- [ ] This task paused → shows ⏸ + paused time + Resume/Stop buttons
- [ ] Different task active → shows "Start Timer" with hint about pausing other task

## 6. Completion with Timer

- [ ] Start timer on a task, wait a bit
- [ ] Complete the task (swipe or status circle)
- [ ] Timer stops automatically
- [ ] ActualTimePrompt appears with message: "Timer recorded X min — adjust if needed"
- [ ] Shows editable number field pre-filled with timer minutes (no multiplier chips)
- [ ] Submit → actualMinutes saved on task
- [ ] Dismiss → no actualMinutes saved

## 7. Completion without Timer

- [ ] Complete a task that has an estimate but NO active timer
- [ ] Standard ActualTimePrompt appears with multiplier chips (unchanged behavior)
- [ ] Complete a task with no estimate and no timer → no prompt shown

## 8. Runaway Timer

- [ ] Start a timer, then wait 4+ hours (or manually adjust `started_at` in DB to >4h ago)
- [ ] Refresh the page
- [ ] Runaway dialog appears: "Timer still running... What happened?"
- [ ] Test "I forgot — adjust to ___ min" → stops with adjusted duration
- [ ] Test "I was actually working that long" → stops with full duration
- [ ] Test "Discard this session" → session deleted, no time recorded

## 9. Edge Cases

- [ ] Start timer → close browser → reopen → timer still running (not paused)
- [ ] Start timer → log out → log back in → timer state restored
- [ ] Start timer on a task, delete the task → timer should stop (cascade delete)
- [ ] Rapid start/stop → no duplicate sessions created

## 10. Build

- [ ] `npm run build` passes with no errors
- [ ] No TypeScript errors
- [ ] No console errors in browser

---

## Notes

- Timer pill position: `bottom-20 left-4` on mobile (above bottom tab bar), `bottom-4 left-4` on desktop
- Timer data is private — not visible to team members
- No MCP tools in Phase 1 (deferred to Phase 2)
