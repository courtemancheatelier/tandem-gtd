# Task Duration Tracking — Feature Spec

**Date:** March 1, 2026
**Author:** Jason Courtemanche / Courtemanche Atelier
**Status:** Draft
**Context:** Capture actual time spent on tasks to power burn-down, burn-up, and velocity charts with real data instead of estimates alone.

---

## 1. Problem Statement

Tandem's burn-down chart and velocity tracker currently operate on estimated time only. When a task completes, the system subtracts its `estimatedMins` from remaining effort. This creates two problems:

1. **Inaccurate burn-down curves.** If estimates are consistently off (and they always are), the burn-down lies. A task estimated at 30 minutes that took 3 hours looks the same on the chart.
2. **No estimation feedback loop.** Users never learn whether their estimates are getting better or worse because the system doesn't track what actually happened.

The `actualMinutes` field already exists in the Task schema (`Int? @map("actual_minutes")`) but nothing populates it. This spec defines how actual time gets captured and how it transforms the dashboard analytics.

---

## 2. Capture Mechanisms

### 2.1 Completion Prompt (Primary)

When the user completes a task that has an `estimatedMins` value, show a lightweight prompt asking how long it actually took. This is the main capture point — it's contextual (you just finished the thing) and takes under 5 seconds.

```
┌─────────────────────────────────────────────────┐
│  ✅ Task completed!                              │
│                                                 │
│  "Refactor cascade engine error handling"       │
│  Estimated: 30 min                              │
│                                                 │
│  How long did this actually take?               │
│                                                 │
│  [15m] [30m] [45m] [1h] [1.5h] [2h+]          │
│                                                 │
│  ┌─────────────────────────────────────┐        │
│  │ Or type: [___] minutes              │        │
│  └─────────────────────────────────────┘        │
│                                                 │
│  [ Skip ]                          [ Save ]     │
└─────────────────────────────────────────────────┘
```

**Design rules:**

- **Only shown when the task has an estimate.** No estimate = no comparison to make, so no prompt. (The user can still manually set `actualMinutes` on any task via the detail view.)
- **Quick-tap chips are relative to the estimate.** The chip values are generated dynamically: 50%, 100%, 150%, 200%, 250%, 300%+ of the estimate, rounded to friendly numbers. A 20-minute estimate shows `[10m] [20m] [30m] [40m] [50m] [1h+]`. A 2-hour estimate shows `[1h] [2h] [3h] [4h] [5h] [6h+]`.
- **"Skip" is always available and never guilt-tripped.** Skipping does not set `actualMinutes` to the estimate — it leaves it null. The system treats null as "no data" not "matched estimate."
- **The prompt appears inline** where the task was (in the task list, project view, etc.), not as a modal. It replaces the completed task row briefly, then collapses.
- **Cascade still fires immediately.** The actual-time prompt doesn't block the cascade engine. Next actions promote instantly; the time capture is a cosmetic overlay that writes asynchronously.

### 2.2 Manual Entry (Secondary)

Users can always set or update `actualMinutes` from the task detail view, whether or not the task is completed. This covers cases like:

- Entering time for tasks completed before this feature existed
- Correcting an inaccurate completion prompt entry
- Logging time on in-progress tasks (partial tracking)

**UI:** Add an "Actual time" field to the task detail panel, next to the existing "Estimated time" field. When both values are present, show a small inline comparison:

```
  Estimated:  30 min
  Actual:     45 min  (▲ 50% over)
```

Or:

```
  Estimated:  2 hr
  Actual:     1 hr 15 min  (▼ 37% under)
```

Color-code the delta: amber for over-estimate, blue for under-estimate, green for within ±10%.

### 2.3 MCP / AI Surface

Add `actualMinutes` as an optional parameter to the existing `tandem_task_complete` MCP tool:

```typescript
tandem_task_complete(taskId: string, actualMinutes?: number)
```

When completing via Claude, the AI can ask conversationally: "That was estimated at 30 minutes — about how long did it actually take?" and pass the value through. This keeps the capture friction-free in the MCP workflow.

Also update `tandem_task_update` to accept `actualMinutes` for manual corrections.

### 2.4 Tasks Without Estimates

For tasks that have no `estimatedMins`:

- **No completion prompt.** Don't ask "how long did this take?" when there's no estimate to compare against — it turns into a time tracker, which isn't the goal.
- **Manual entry still available.** The detail view always shows the actual time field regardless.
- **Dashboard treatment:** Tasks with `actualMinutes` but no `estimatedMins` contribute to velocity (actual hours worked) but not to estimation accuracy metrics.

---

## 3. Data Model Changes

### 3.1 Schema

The `actualMinutes` field already exists on Task:

```prisma
model Task {
  // Already exists
  actualMinutes   Int?     @map("actual_minutes")
}
```

No schema migration needed. However, the field needs to be:

- Added to the `updateTaskSchema` Zod validation (in `src/lib/validations/task.ts`)
- Exposed in the task update API endpoint
- Added to the task detail UI component
- Included in the `tandem_task_complete` and `tandem_task_update` MCP tool definitions
- Included in event sourcing — `TaskEvent` should capture changes to `actualMinutes`

### 3.2 Event Sourcing

When `actualMinutes` is set (via completion prompt, manual entry, or MCP), create a `TaskEvent`:

```json
{
  "eventType": "UPDATED",
  "changes": {
    "actualMinutes": { "old": null, "new": 45 }
  },
  "message": "Actual time recorded on completion",
  "source": "MANUAL"
}
```

This ensures the history timeline shows when actual time was logged and by whom.

---

## 4. Dashboard Analytics — Enhanced Charts

### 4.1 Burn-Down Chart (Enhanced)

**Current behavior:** Subtracts `estimatedMins` of completed tasks from total estimated effort to show remaining work.

**New behavior:** Two modes, toggled by the user:

#### Mode A: Estimate-Based Burn-Down (Default — Current Behavior)

No change. Remaining effort = total estimated - sum of estimates for completed tasks. This is the planning view: "Based on our estimates, how much work remains?"

#### Mode B: Actuals-Adjusted Burn-Down

When actual time data exists, show a second line that uses `actualMinutes` for completed tasks instead of `estimatedMins`:

```
Remaining effort (actuals-adjusted) = 
  sum(estimatedMins for incomplete tasks) 
  + sum(estimatedMins for completed tasks where actualMinutes is null)
  - sum(actualMinutes for completed tasks where actualMinutes is not null)
  - sum(estimatedMins for completed tasks where actualMinutes is null)
```

Wait — simpler way to think about it:

```
Total scope = sum(estimatedMins) for all tasks
Work done   = sum(actualMinutes ?? estimatedMins) for completed tasks
Remaining   = Total scope - Work done
```

But this doesn't quite work because the *scope* is estimated and the *work done* is actual — they're in different units. The real insight is:

**Burn-down by task count / estimated hours remaining** (existing chart, unchanged) + an **estimation accuracy overlay** that shows the drift:

```
┌─────────────────────────────────────────────────┐
│  Burn-Down — Tandem v2                           │
│                                                 │
│  hours                                          │
│  remaining                                      │
│  │                                              │
│  │╲  Ideal                                      │
│  │ ╲╲                                           │
│  │  ╲ ╲....  Estimated remaining                │
│  │   ╲  ╲  ·····                                │
│  │    ╲   ╲─────  Actual effort spent           │
│  │     ╲    ╲      (cumulative)                 │
│  │      ╲    ·····                              │
│  │       ╲                                      │
│  └──────────────────────────── time             │
│                                                 │
│  📊 Estimation drift: +22% (actual > estimated) │
│  At current rate, ~18 hours remain vs 14        │
│  estimated                                      │
└─────────────────────────────────────────────────┘
```

**Three lines on the burn-down:**

| Line | Color | Data |
|------|-------|------|
| Ideal | Slate-400, dashed | Straight diagonal from total estimate to zero at deadline |
| Estimated remaining | Blue-500, solid (existing) | Total estimate minus estimated mins of completed tasks |
| Actual effort (cumulative) | Emerald-500, solid (new) | Cumulative `actualMinutes` of completed tasks, plotted upward from zero |

The gap between the estimated-remaining line dropping and the actual-effort line rising tells the story: if actual effort rises faster than estimated effort drops, the team is burning through more hours than planned.

**Projected completion (enhanced):**

When actual data exists for 3+ completed tasks, compute a projection based on the ratio:

```typescript
const estimationAccuracyRatio = 
  sumActualMinutes / sumEstimatedMinsForThoseSameTasks;

// e.g., if tasks estimated at 100 min actually took 130 min → ratio = 1.3

const adjustedRemaining = 
  sumEstimatedMinsForIncompleteTasks * estimationAccuracyRatio;
```

Show this as a dashed projected line: "At your current estimation accuracy, ~X hours remain."

### 4.2 Burn-Up Chart (New)

Burn-up charts are the complement to burn-down — they show cumulative work completed over time, with scope changes visible as the top line moving. They answer "how much have we done?" rather than "how much is left?"

```
┌─────────────────────────────────────────────────┐
│  Burn-Up — Tandem v2                             │
│                                                 │
│  hours                                          │
│  │                                              │
│  │─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  Total scope     │
│  │                         ╱   (estimated)      │
│  │─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ╱    ← scope added   │
│  │                       ╱                      │
│  │              ╱╱╱╱╱╱╱╱╱  Estimated completed  │
│  │         ╱╱╱╱╱                                │
│  │    ╱╱╱╱╱                                     │
│  │╱╱╱╱  ────────────────  Actual completed      │
│  │╱  ───────────                                │
│  └──────────────────────────── time             │
│                                                 │
│  Scope grew +12% since project start            │
│  Actual completion pace: 85% of estimated pace  │
└─────────────────────────────────────────────────┘
```

**Four lines:**

| Line | Color | Data |
|------|-------|------|
| Total scope | Slate-400, dashed, top | Cumulative `estimatedMins` for all tasks in project (steps up when tasks added) |
| Estimated completed | Blue-500, solid | Cumulative `estimatedMins` of completed tasks over time |
| Actual completed | Emerald-500, solid | Cumulative `actualMinutes` of completed tasks over time |
| Scope change markers | Dotted vertical lines | Points where tasks were added/removed from project |

**Why both burn-up and burn-down?**

- Burn-down is better for "will we finish on time?" — the angle toward zero is intuitive
- Burn-up is better for "is scope creeping?" — you can see the top line rising while completion stays flat
- Both are standard in agile project management; offering both gives users the right lens for their situation

### 4.3 Velocity Chart (Enhanced)

**Current behavior:** Shows tasks completed per week (count) with a 12-week trend.

**New behavior:** Dual-unit velocity with estimation accuracy.

#### Velocity by Hours (New Default)

Switch the primary velocity metric from task count to hours:

```
┌─────────────────────────────────────────────────┐
│  Velocity — Last 12 Weeks                        │
│                                                 │
│  hours/week   [Count ▾] [Hours ▾] [Accuracy ▾] │
│  │                                              │
│  │     ██                                       │
│  │  ██ ██    ██ ██                              │
│  │  ██ ██ ██ ██ ██ ██    ██                     │
│  │  ██ ██ ██ ██ ██ ██ ██ ██ ██ ██ ██ ██        │
│  │──────────── avg: 8.5h/wk ─────────          │
│  └──────────────────────────── weeks            │
│                                                 │
│  ■ Estimated hours  ■ Actual hours              │
└─────────────────────────────────────────────────┘
```

Each week's bar is split or side-by-side:
- **Estimated hours:** Sum of `estimatedMins` for tasks completed that week
- **Actual hours:** Sum of `actualMinutes` for tasks completed that week (where available)

The average line helps predict capacity: "I typically complete about 8.5 actual hours of work per week."

#### Velocity Toggle

Three views, selectable via tabs or dropdown:

| View | Y-Axis | Use Case |
|------|--------|----------|
| **Count** | Tasks completed per week | Simple throughput metric |
| **Hours** | Estimated + actual hours per week | Capacity planning |
| **Accuracy** | Estimation accuracy ratio per week (see §4.4) | Improving estimates |

### 4.4 Estimation Accuracy Dashboard (New Widget)

This is the feedback loop that makes the whole system valuable. It answers: "Am I getting better at estimating?"

```
┌─────────────────────────────────────────────────┐
│  📐 Estimation Accuracy                          │
│                                                 │
│  Overall: tasks take 1.3x longer than estimated │
│  ████████████████████░░░░░░░░  130%             │
│  (100% = perfect estimation)                    │
│                                                 │
│  By energy level:                               │
│  High   ████████████████████████████  156%      │
│  Medium ████████████████████░░░░░░░░  118%      │
│  Low    ██████████████████░░░░░░░░░░  107%      │
│                                                 │
│  By time bracket:                               │
│  < 15 min   ██████████████████████░░  122%      │
│  15-60 min  ████████████████████░░░░  131%      │
│  1-2 hours  ██████████████████████████ 148%     │
│  2+ hours   ████████████████████████████ 167%   │
│                                                 │
│  Trend: improving ↓ (was 1.45x eight weeks ago) │
└─────────────────────────────────────────────────┘
```

**Key metrics:**

| Metric | Formula | Insight |
|--------|---------|---------|
| **Overall ratio** | `sum(actual) / sum(estimated)` for all tasks with both values | "I generally underestimate by 30%" |
| **By energy level** | Same ratio filtered by `energyLevel` | "High-energy tasks are my worst estimates" |
| **By estimate bracket** | Same ratio grouped by estimated duration ranges | "The bigger the task, the worse I estimate" — classic planning fallacy |
| **By context** | Same ratio filtered by context | "I underestimate @computer work but nail @errands" |
| **Trend line** | Rolling 4-week average of the ratio over time | "Am I getting better at this?" |
| **Accuracy band** | % of tasks where actual was within ±25% of estimated | "42% of my estimates were in the right ballpark" |

**Minimum data threshold:** Show the accuracy dashboard only when 10+ tasks have both `estimatedMins` and `actualMinutes`. Below that threshold, show a progress indicator: "Log actual time on 4 more tasks to unlock estimation insights."

---

## 5. API Changes

### 5.1 Task Completion Endpoint

Update `POST /api/tasks/:id/complete` (or equivalent) to accept optional `actualMinutes`:

```typescript
// Request body (optional)
{
  actualMinutes?: number  // Actual time spent in minutes
}
```

If provided, set `task.actualMinutes` before triggering the cascade. This keeps it atomic — one request completes the task and logs the time.

### 5.2 Task Update Endpoint

`PATCH /api/tasks/:id` already handles field updates. Ensure `actualMinutes` is:
- Included in the Zod schema (`z.number().int().positive().optional()`)
- Accepted and persisted
- Event-sourced (creates a `TaskEvent` with the change)

### 5.3 Dashboard Stats Endpoint

Update `GET /api/dashboard/stats` to return additional data:

```typescript
// New fields in response
{
  // Existing (enhanced)
  burnDown: {
    data: {
      date: string;
      remaining: number;        // Estimated remaining (existing)
      actualCumulative: number;  // NEW: cumulative actual hours completed
    }[];
    totalEstimate: number;
    estimationDrift: number;    // NEW: ratio of actual/estimated for completed tasks
  },

  // Existing (enhanced)
  velocity: {
    data: {
      week: string;
      completedCount: number;
      completedEstimatedMins: number;   // Renamed from completedMins
      completedActualMins: number;      // NEW
      accuracyRatio: number | null;     // NEW: actual/estimated for that week
    }[];
    averagePerWeek: number;
    averageActualHoursPerWeek: number;  // NEW
  },

  // NEW
  burnUp: {
    data: {
      date: string;
      totalScope: number;          // Cumulative estimated hours (all tasks)
      estimatedCompleted: number;   // Cumulative estimated hours (completed tasks)
      actualCompleted: number;      // Cumulative actual hours (completed tasks)
    }[];
  },

  // NEW
  estimationAccuracy: {
    overall: {
      ratio: number;               // actual / estimated
      taskCount: number;            // Tasks with both values
      accuracyBand: number;         // % within ±25%
    };
    byEnergyLevel: {
      level: string;
      ratio: number;
      taskCount: number;
    }[];
    byEstimateBracket: {
      bracket: string;              // "< 15 min", "15-60 min", etc.
      ratio: number;
      taskCount: number;
    }[];
    byContext: {
      contextName: string;
      ratio: number;
      taskCount: number;
    }[];
    trend: {
      week: string;
      ratio: number;
    }[];
  }
}
```

### 5.4 Project-Level Endpoint

Add project-scoped versions for burn-down/burn-up when viewing a single project:

```
GET /api/projects/:id/analytics
```

Returns the same burn-down, burn-up, velocity, and accuracy structures but scoped to tasks within that project (including sub-project tasks via rollup).

---

## 6. MCP Tool Updates

### 6.1 tandem_task_complete

Add optional `actualMinutes` parameter:

```typescript
{
  name: "tandem_task_complete",
  description: "Mark a task as completed. Optionally record actual time spent. Triggers cascade engine.",
  inputSchema: {
    properties: {
      taskId: { type: "string", description: "The ID of the task to complete" },
      actualMinutes: { 
        type: "number", 
        description: "Actual time spent in minutes. If the task had an estimate, this helps calibrate future planning." 
      },
    },
    required: ["taskId"],
  }
}
```

### 6.2 tandem_task_update

Ensure `actualMinutes` is documented as an accepted field:

```typescript
{
  // In the properties for tandem_task_update:
  actualMinutes: {
    type: "number",
    description: "Actual time spent in minutes. Set to 0 to clear."
  }
}
```

### 6.3 New: tandem_estimation_accuracy

Expose estimation insights via MCP so the AI can reference them during planning:

```typescript
{
  name: "tandem_estimation_accuracy",
  description: "Get estimation accuracy data — how actual task durations compare to estimates. Useful for calibrating future estimates.",
  inputSchema: {
    properties: {
      projectId: { type: "string", description: "Optional: scope to a specific project" },
      weeks: { type: "number", description: "Look-back window in weeks (default: 12)" },
    },
  }
}
```

This enables flows like:

```
User: I'm estimating tasks for the new sewing project. 
      Each garment takes about 2 hours I think.

Claude: [calls tandem_estimation_accuracy]

Based on your history, you tend to underestimate tasks in 
the 1-2 hour range by about 48%. Your 2-hour garment 
estimate will likely take closer to 3 hours. Want me to 
set estimates at 3 hours to be safe?
```

---

## 7. UI Components

### 7.1 Completion Prompt Component

`src/components/tasks/ActualTimePrompt.tsx`

- Rendered inline after task completion animation
- Quick-tap chips generated relative to the task's estimate
- Freeform minute input with validation
- Skip button (no guilt copy)
- Auto-dismisses after 15 seconds if no interaction (does not set a value)
- Fires `PATCH /api/tasks/:id` with `{ actualMinutes }` on submit

### 7.2 Task Detail — Actual Time Field

`src/components/tasks/TaskDetail.tsx` (existing, modified)

- Add "Actual time" field below "Estimated time"
- Show delta indicator when both values present
- Editable regardless of task status (completed tasks can have their actual time corrected)

### 7.3 Burn-Up Widget

`src/components/dashboard/BurnUpWidget.tsx` (new)

- Same visual treatment as BurnDownWidget (Recharts LineChart)
- Three lines: total scope, estimated completed, actual completed
- Scope change markers as vertical dotted lines
- Placed in DashboardGrid alongside burn-down

### 7.4 Estimation Accuracy Widget

`src/components/dashboard/EstimationAccuracyWidget.tsx` (new)

- Bar chart for ratio breakdowns (by energy, by bracket, by context)
- Trend line for rolling 4-week accuracy
- Overall ratio as a prominent headline metric
- Minimum data threshold gating (10+ tasks)

### 7.5 Enhanced Velocity Widget

`src/components/dashboard/VelocityWidget.tsx` (existing, modified)

- Add tab/toggle for Count / Hours / Accuracy views
- Grouped or stacked bars showing estimated vs actual hours
- Rolling average line

---

## 8. User Settings

### 8.1 Completion Prompt Preference

Some users won't want the prompt on every completion. Add to user settings:

```
Actual time tracking:
  [●] Ask after every completed task with an estimate
  [○] Ask only for tasks over [30] minutes estimated
  [○] Never ask (I'll log manually)
```

Default: Ask after every completed task with an estimate.

### 8.2 Dashboard Defaults

```
Burn-down display:
  [✓] Show actual effort line (when data available)
  [✓] Show projected completion based on accuracy ratio

Velocity display:
  Default view: [Hours ▾]
```

---

## 9. Interaction with Other Features

### 9.1 Weekly Review

During the "Get Current → Review Action Lists" step, surface a summary:

- "This week you completed 12 tasks. 8 had actual time logged."
- "Your estimation accuracy this week: 1.18x (18% over estimates)"
- "Biggest miss: 'Refactor cascade engine' — estimated 1h, took 3.5h"

This reinforces the feedback loop without requiring the user to visit the dashboard.

### 9.2 Time Audit Challenge (Separate Feature)

As noted in the Time Audit Challenge spec, these features are intentionally decoupled. However, a future integration point exists: during a Time Audit Challenge day, entries tagged as "Task work" and linked to a specific task could optionally contribute to that task's `actualMinutes`. This is explicitly out of scope for both v1 specs.

### 9.3 Gantt Chart

The Gantt already references `actualMinutes` in its data requirements table (PM_FEATURES.md §3.2). When actual time is available, the Gantt can show an overlay:

- Bar width = estimated duration (planning view)
- A secondary fill or marker showing actual duration
- Overruns highlighted in amber/red

### 9.4 AI Planning Assistant

When the AI helps estimate new tasks (during inbox processing or project planning), it can reference the user's estimation accuracy data to suggest calibrated estimates. See §6.3 for the MCP tool that enables this.

---

## 10. Rollout Strategy

### Phase 1: Capture (Week 1-2)

- [ ] Add `actualMinutes` to Zod validation schemas
- [ ] Update task PATCH endpoint to accept and persist `actualMinutes`
- [ ] Build `ActualTimePrompt` component
- [ ] Wire prompt into task completion flow
- [ ] Add actual time field to task detail view
- [ ] Update MCP `tandem_task_complete` tool
- [ ] Event sourcing for `actualMinutes` changes

### Phase 2: Basic Analytics (Week 3-4)

- [ ] Update `GET /api/dashboard/stats` with actual-time-enhanced data
- [ ] Add actual effort line to burn-down chart
- [ ] Add estimated vs actual bars to velocity chart
- [ ] Build basic estimation accuracy widget (overall ratio + trend)

### Phase 3: Full Analytics (Week 5-6)

- [ ] Build burn-up chart widget
- [ ] Add accuracy breakdowns by energy, bracket, context
- [ ] Build project-level analytics endpoint
- [ ] Add estimation accuracy to weekly review flow
- [ ] Build `tandem_estimation_accuracy` MCP tool
- [ ] User settings for prompt preferences

### Phase 4: AI Integration (Week 7-8)

- [ ] AI-calibrated estimates during inbox processing
- [ ] Gantt actual-time overlay
- [ ] Projected completion based on accuracy ratio

---

## 11. Key Design Principles

1. **Capture must be frictionless.** If logging actual time takes more than 5 seconds, people won't do it. The quick-tap chips are the critical UX decision — they must feel instant.

2. **No data is better than bad data.** Skipping the prompt leaves `actualMinutes` null, which the system handles gracefully. Never default to the estimate — that would poison the accuracy metrics.

3. **Observations, not judgments.** "Your tasks took 1.3x longer than estimated" is useful. "You're bad at estimating" is not. The framing matters.

4. **Actual time serves planning, not surveillance.** This is personal productivity data. In team contexts, individual actual-time data is visible only to the person who logged it. Project-level aggregates (total actual hours) may be visible to project members, but per-task breakdowns are private.

5. **The feedback loop is the feature.** The completion prompt alone isn't valuable. The estimation accuracy dashboard closing the loop — showing you're getting better (or revealing blind spots) — is what changes behavior over time.

---

## Design Notes (to consider during implementation)

### Passive Time Tracking via Status Changes

Rather than relying solely on manual time entry at completion, we could passively track how long tasks stay in the IN_PROGRESS state. This gives us two layers of time data:

- **Status duration** — automatically captured whenever a task moves to IN_PROGRESS and then to COMPLETED or back to NOT_STARTED. No user action required beyond the status changes they already make.
- **Active work time** — when a user marks a task IN_PROGRESS, a background timer starts. A "Pause" button (e.g., a pause icon on the task card) stops the timer without changing the task status. Resume by tapping again. The timer is invisible — no countdown displayed, no pressure — but the data is captured silently.

This creates a natural habit: mark a task IN_PROGRESS when you sit down to work on it, pause when you take a break, complete when done. The user never sees a timer, but Tandem knows the difference between "this task was in progress for 3 hours" and "the user actively worked on it for 47 minutes across two sessions."

The delta between total in-progress duration and active work time is itself an insight — it reveals context-switching overhead, interruption patterns, and the gap between "working on it" and "actually working on it."

---

*This spec is a living document. Bring it to Claude Code sessions for Tandem implementation.*
