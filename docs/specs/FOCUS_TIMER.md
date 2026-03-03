# Focus Timer — Spec v1.0

**Date:** March 1, 2026
**Author:** Jason Courtemanche / Courtemanche Atelier
**Context:** A gentle, opt-in focus timer for Tandem that closes the feedback loop between estimated and actual time on tasks — without becoming a surveillance tool or source of self-judgment.

---

## 1. Philosophy

### 1.1 Why This Exists

Tandem already tracks `estimatedMinutes` and `actualMinutes` on tasks. The problem is that `actualMinutes` is almost always a guess entered after the fact. Humans are terrible at estimating time they've already spent — we compress boring work and expand engaging work in memory. This timer gives users **real data** about where their time goes, so they can make better decisions during the GTD engage step.

### 1.2 What This Is NOT

This is not a productivity tracker. It is not a timesheet. It is not a tool for managers to monitor workers. It is not a source of guilt.

**Design principles:**

- **Gentle, not urgent.** No red countdowns, no flashing warnings, no anxiety-inducing visuals.
- **Informational, not judgmental.** Going over your estimate is data, not failure. The UI never frames overages negatively.
- **Opt-in at every level.** Users who don't want timing don't see timing. No defaults that create pressure.
- **Cumulative, not continuous.** The timer accumulates across multiple sessions. Real work gets interrupted — the timer respects that.
- **Private by default.** Timer data belongs to the individual. Team views never surface individual time-per-task metrics.

### 1.3 The Tango Analogy

In tango, you don't count steps or track the clock during a dance — you stay present with your partner and the music. But between tandas, you naturally reflect: "That felt short" or "We really found our groove in that last song." The timer works the same way. While you're working, it's quiet background presence. When you finish, it offers gentle reflection: here's what actually happened.

---

## 2. User Experience

### 2.1 Starting a Timer

The timer appears as a subtle, optional element on the task detail view and the "What Should I Do Now?" recommendation cards.

**Entry points:**

1. **Task Detail View** — A small play button (▶) next to the task title. Unobtrusive. Not the primary action.
2. **"What Should I Do Now?" Cards** — When you select a recommended task, a gentle prompt: "Start timing?" with a single tap to begin. Easy to dismiss or ignore.
3. **Quick Action** — From any task list, long-press/right-click → "Start Timer" in the context menu.

**What happens on start:**

- A minimal floating indicator appears (persistent but small — think a subtle pill in the header or a colored dot on the active task).
- The indicator shows elapsed time in minutes only. No seconds. No countdown. Just "12 min" updating every minute.
- If the task has an `estimatedMinutes` value, the indicator does NOT show a countdown or progress bar against it. The estimate is irrelevant while you're working — it only matters during reflection.

### 2.2 While Running

**The timer is quiet.**

- No sounds, no chimes, no interruptions.
- The floating indicator stays visible but doesn't demand attention.
- If the user navigates away from the task view, the indicator persists in the header/nav area as a small pill: `● Task Name · 12 min`
- Tapping the indicator returns to the task detail view.

**Pause behavior:**

- Tapping the indicator or a pause button pauses the timer. The pill changes to show paused state: `⏸ Task Name · 12 min`
- **Auto-save on pause:** The session is persisted immediately on pause. If the page refreshes, the browser closes, or the user navigates away, the paused session survives in the database. When the user returns and resumes, elapsed time is added to the **same session** — not a new one. This means users never lose tracked time to a page refresh or accidental close.
- Auto-pause: If the user starts a timer on a different task, the current timer pauses automatically (and auto-saves). Only one timer runs at a time. No prompt, no confirmation — just a smooth handoff. The paused task's time is preserved and resumable.
- No auto-pause on app close or screen lock — the timer continues running. Most focus sessions involve stepping away from the app. (If the user reopens Tandem 8 hours later with a timer still running, a gentle nudge: "Timer still running from earlier — 487 min. Adjust?")

### 2.3 Completing a Task with Timer Running

When the user completes a task that has an active or paused timer:

1. The timer stops automatically.
2. The completion flow shows the actual time recorded: **"You spent about 34 minutes on this."**
3. If the task had an estimate, a neutral comparison: **"Estimated: 25 min · Actual: 34 min"** — no color coding, no good/bad framing, just facts.
4. An edit field allows the user to adjust the actual time if they know the timer was inaccurate (left it running during lunch, etc.).
5. The value saves to `actualMinutes` on the task.

**If no timer was running:** The completion flow is unchanged from current behavior. No nagging about "you didn't use the timer."

### 2.4 Completing Without Finishing

Sometimes you work on something, run out of time, and need to stop without completing the task:

- **Stop Timer** action (available from the indicator or task detail) stops timing and saves the accumulated time as a **session** without completing the task.
- When the user returns to the task later and starts the timer again, time accumulates across sessions.
- The task detail shows total accumulated time: **"34 min across 2 sessions"**
- On eventual completion, the total is pre-filled as `actualMinutes`.

---

## 3. Data Model

### 3.1 New Model: TaskTimerSession

```prisma
model TaskTimerSession {
  id          String   @id @default(cuid())
  taskId      String   @map("task_id")
  userId      String   @map("user_id")
  startedAt   DateTime @map("started_at")
  pausedAt    DateTime? @map("paused_at")
  endedAt     DateTime? @map("ended_at")
  durationMin Int      @default(0) @map("duration_min")  // Computed on end
  isActive    Boolean  @default(true) @map("is_active")
  
  task        Task     @relation(fields: [taskId], references: [id], onDelete: Cascade)
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  
  @@map("task_timer_sessions")
  @@index([taskId])
  @@index([userId, isActive])
}
```

### 3.2 Changes to Task Model

```prisma
model Task {
  // Existing fields
  estimatedMinutes  Int?    @map("estimated_minutes")
  actualMinutes     Int?    @map("actual_minutes")
  
  // New relation
  timerSessions     TaskTimerSession[]
}
```

**No new fields on Task itself.** The `actualMinutes` field already exists and gets populated from accumulated session data on completion. Timer sessions are the source of truth; `actualMinutes` is the summary.

### 3.3 Active Timer State

Only one timer can be active per user at any time. Enforced at the application level:

- Starting a new timer auto-ends (pauses) any existing active timer for that user.
- Query: `WHERE userId = ? AND isActive = true` should return at most one row.

---

## 4. API Endpoints

```
POST   /api/timer/start          Start timer for a task
POST   /api/timer/pause          Pause the active timer
POST   /api/timer/resume         Resume a paused timer
POST   /api/timer/stop           Stop timer, save session (without completing task)
GET    /api/timer/active         Get current active timer (if any)
GET    /api/tasks/:id/sessions   Get all timer sessions for a task
PATCH  /api/tasks/:id/actual     Manually adjust actualMinutes (override)
```

### 4.1 Start Timer

```json
POST /api/timer/start
{
  "taskId": "clx..."
}

Response:
{
  "session": { "id": "...", "taskId": "...", "startedAt": "...", "isActive": true },
  "pausedSession": { "id": "...", "taskId": "..." } | null  // If another timer was running
}
```

### 4.2 Stop Timer

```json
POST /api/timer/stop

Response:
{
  "session": { "id": "...", "durationMin": 34, "isActive": false },
  "totalTaskMinutes": 67  // Accumulated across all sessions for this task
}
```

---

## 5. UI Components

### 5.1 Timer Indicator (Floating Pill)

Appears in the top nav/header area when a timer is active.

```
┌──────────────────────────────────────────────────┐
│  ● Review Vault backup procedures · 12 min   ⏸  │
└──────────────────────────────────────────────────┘
```

**States:**
- **Running:** Soft accent color dot (not red — use the app's primary/calm color). Task name truncated. Elapsed minutes. Pause button.
- **Paused:** Muted color. Pause icon. Resume on tap.
- **Absent:** No indicator. No empty state. No "start a timer!" prompt.

### 5.2 Task Detail Timer Section

Below the task title and metadata, a collapsible section (collapsed by default for tasks with no sessions):

```
┌─ Time ──────────────────────────────────────────┐
│                                                  │
│  Estimated: 25 min                               │
│  Actual:    34 min (2 sessions)                  │
│                                                  │
│  [▶ Start Timer]                                 │
│                                                  │
└──────────────────────────────────────────────────┘
```

When timer is running:

```
┌─ Time ──────────────────────────────────────────┐
│                                                  │
│  Estimated: 25 min                               │
│  Current session: 12 min ●                       │
│  Previous sessions: 22 min                       │
│                                                  │
│  [⏸ Pause]  [⏹ Stop]                            │
│                                                  │
└──────────────────────────────────────────────────┘
```

### 5.3 Completion Dialog Enhancement

When completing a task that has timer data:

```
┌─ Complete Task ─────────────────────────────────┐
│                                                  │
│  ✓ Review Vault backup procedures                │
│                                                  │
│  Time spent: 34 min                              │
│  Estimated:  25 min                              │
│                                                  │
│  ┌──────────────┐                                │
│  │ 34      min  │  ← Editable, pre-filled        │
│  └──────────────┘                                │
│  Adjust if the timer was inaccurate              │
│                                                  │
│  [Complete]                    [Cancel]           │
│                                                  │
└──────────────────────────────────────────────────┘
```

**No emoji, no celebration, no "great job!" — just clean confirmation.** The cascade engine fires as normal after completion.

---

## 6. Weekly Review Integration

### 6.1 Estimation Accuracy Insight

During the "Get Current → Review Action Lists" step of the weekly review, surface a gentle insight:

```
┌─ Time Awareness ────────────────────────────────┐
│                                                  │
│  This week you timed 12 tasks.                   │
│                                                  │
│  Your estimates were within 20% on 8 of them.    │
│  Tasks that took longer than expected tended      │
│  to be @Computer / High Energy tasks.            │
│                                                  │
│  This is just a pattern — not a problem.         │
│  You might use it when estimating similar         │
│  tasks next week.                                │
│                                                  │
└──────────────────────────────────────────────────┘
```

**Language guidelines for this section:**
- Never use "you underestimated" — say "took longer than expected"
- Never use "only" ("you only completed...") — state facts neutrally
- Always end with an actionable, no-pressure suggestion
- If the user didn't use the timer at all this week, say nothing. Don't surface an empty state or a "try the timer!" nudge.

### 6.2 Velocity Feed

Timer data feeds the existing velocity tracking and burn-down chart features. Actual minutes vs. estimated minutes per project gives a real velocity multiplier:

- If a project's tasks consistently take 1.5x the estimate, the burn-down projection can account for that.
- This is shown at the project level, never the individual task level. The insight is "this project is moving at 0.7x estimated pace" not "you're slow at these tasks."

---

## 7. What We Explicitly Don't Build

| Feature | Why Not |
|---------|---------|
| **Daily/weekly time reports** | This isn't a timesheet app. Aggregated time data exists in the DB for power users who want to query it, but we don't build dashboard views showing "you worked 6.2 hours today." |
| **Idle detection** | Tracking whether someone is "actually working" during a timer session is surveillance. If they leave the timer running during a break, that's their data to adjust. |
| **Comparisons between users** | Timer data is never surfaced in team views. A manager cannot see how long an individual took on a task. Team burn-down uses task completion counts, not individual time. |
| **Streaks or gamification** | No "you've timed 5 tasks in a row!" No badges. No streaks. Gamification creates anxiety about breaking the streak, which is the opposite of what we want. |
| **Mandatory timing** | There is no setting to require timer use. Not at the user level, not at the team level, not at the project level. Ever. |
| **Notifications during timing** | The timer never interrupts you. No "you've been working for 60 minutes, take a break!" That's the user's decision. |
| **Historical session playback** | We store sessions for data accuracy, not for forensic reconstruction of someone's workday. Sessions are internal bookkeeping, not a user-facing timeline. |

---

## 8. MCP Integration

### 8.1 New MCP Tools

```typescript
{
  name: "tandem_timer_start",
  description: "Start a focus timer on a task. Only one timer can run at a time — starting a new one pauses any active timer.",
  inputSchema: {
    type: "object",
    properties: {
      taskId: { type: "string", description: "The task ID to start timing" }
    },
    required: ["taskId"]
  }
},
{
  name: "tandem_timer_stop",
  description: "Stop the active focus timer. Saves the session duration without completing the task.",
  inputSchema: {
    type: "object",
    properties: {}
  }
},
{
  name: "tandem_timer_status",
  description: "Get the current active timer status, if any. Returns the task being timed and elapsed minutes.",
  inputSchema: {
    type: "object",
    properties: {}
  }
}
```

### 8.2 MCP Usage Examples

User in Claude.ai: *"Start timing the Vault backup task"*
→ Claude searches for the task, calls `tandem_timer_start`

User: *"How long have I been working on this?"*
→ Claude calls `tandem_timer_status`, responds naturally: "You've been on the Vault backup task for about 18 minutes."

User: *"I'm done for now, stop the timer"*
→ Claude calls `tandem_timer_stop`: "Stopped — 23 minutes recorded on that session. Want to mark it complete or come back to it later?"

---

## 9. Settings

### 9.1 User Preferences

```
Timer Settings
─────────────────────────────────────
☐  Show timer indicator in header when active
    (Default: ON)

☐  Show time section on task detail view
    (Default: ON)

☐  Show estimation insights during weekly review
    (Default: ON)

☐  Auto-prompt "Start timing?" when selecting
    a task from What Should I Do Now?
    (Default: OFF — opt-in only)

☐  Include timer data in burn-down projections
    (Default: ON)
─────────────────────────────────────
```

### 9.2 What's NOT in Settings

- No setting to make timing mandatory
- No setting to share timer data with team
- No setting to set "target hours per day"
- No setting to enable idle detection
- No setting for break reminders

---

## 10. Runaway Timer Handling

If a user opens Tandem and finds a timer that's been running for an unreasonably long time (e.g., left it overnight):

```
┌─ Timer Still Running ───────────────────────────┐
│                                                  │
│  You have a timer running from yesterday:        │
│                                                  │
│  "Review Vault backup procedures"                │
│  Running for: 14 hours 23 minutes                │
│                                                  │
│  What happened?                                  │
│                                                  │
│  [I forgot — adjust to _____ min]                │
│  [I was actually working that long]              │
│  [Discard this session]                          │
│                                                  │
└──────────────────────────────────────────────────┘
```

**Threshold for "runaway" prompt:** Timer running for more than 4 hours without user interaction. Configurable? No — keep it simple. 4 hours is a reasonable heuristic.

The tone is curious, not accusatory. "What happened?" not "You left your timer running!"

---

## 11. Implementation Priority

### Phase 1: Core Timer (MVP)
- TaskTimerSession model + migration
- Start/pause/stop/resume API endpoints
- Floating pill indicator in header
- Timer section on task detail view
- Auto-populate actualMinutes on task completion
- Runaway timer handling

### Phase 2: Integration
- MCP tools for Claude.ai timer control
- Weekly review estimation accuracy insight
- Velocity/burn-down data feed from actual minutes

### Phase 3: Polish
- "What Should I Do Now?" gentle prompt (opt-in)
- Session history on task detail (minimal — just count and total)
- Mobile-optimized timer controls (thumb-accessible start/stop)

---

## 12. Resolved Design Decisions

1. **Paused timers auto-save.** When a timer is paused, the session is persisted immediately. If the page refreshes, closes, or the user navigates away, the paused session survives. When the user returns and resumes, time is added to the same session — not a new one. The 4-hour runaway threshold still applies: if a *running* (not paused) timer exceeds 4 hours without interaction, the runaway prompt appears on next app load.

2. **Timer sessions are separate from event sourcing.** TaskTimerSessions are their own audit trail, not routed through the task event sourcing system. Timer events are high-frequency operational data (start/pause/resume/stop happening multiple times per task). The event sourcing system is designed for deliberate state changes (status transitions, field edits, completions). Mixing them would create noise in task history and cascade traces. The `actualMinutes` value that gets written to the Task on completion *does* create a normal event sourcing entry — that's the meaningful state change.

3. **Keyboard shortcut: `T` scoped to task selection context.** `T` toggles the timer on the currently selected/highlighted task in list views. Like the existing `E` (edit), `D` (due date), and `C` (context) shortcuts, it only fires when a task is selected and no text input field has focus. When the user is typing in any input, textarea, or contenteditable element, `T` types the letter normally. This follows the established Tandem keyboard shortcut pattern — no modifier key needed.

4. **MCP completions without timer: no change.** Tasks completed via MCP or any other path without an active timer behave exactly as today — `actualMinutes` stays null unless explicitly provided. No nudging, no empty state, no "you didn't time this" messaging.
