# Tandem Feature Spec: Commitment Drift Dashboard

**Version:** 1.2  
**Date:** March 4, 2026  
**Author:** Jason Courtemanche  
**Status:** Draft

---

## 1. Executive Summary

Every time a user bumps a due date or defers a task, they are making a quiet trade: this other thing matters more than the agreement I made with myself. Most of the time that decision is invisible and forgotten. Over weeks and months it adds up into patterns — entire life areas where commitments quietly erode.

The Commitment Drift Dashboard makes those patterns visible without judgment. It answers three questions:

1. **Where does drift cluster?** — Which areas of life (GTD Areas) have the most repeated deferrals and due-date pushes?
2. **What are your most-deferred commitments?** — Which specific tasks have been bumped the most and by how much total time?
3. **What displaced them?** — When you deferred something, what did you complete instead? This is the "what are you making more important?" insight.

The framing is **positive and supportive, never shaming.** Drift is data. Patterns reveal where a system needs redesign. The dashboard's job is to celebrate momentum, surface opportunities for microscopic improvement, and gently flag commitments that may benefit from being broken into smaller pieces.

> **The microscopic change principle:** A 1-minute meditation habit in week one, 2 minutes in week two — by end of year that's 52 minutes daily. The goal is not to do more all at once. It's to do a little more each week than last week. This dashboard makes small improvements visible before they compound into large ones.

---

## 2. This Is a Standalone Dashboard

The Commitment Drift Dashboard is its own page in Tandem's navigation, not a tab within the Insight Dashboard. Rationale:

- It is meaningfully distinct from project health — it's about behavioral patterns across the whole system, not project progress.
- It is designed to be **opt-in and hideable** at the user level. A standalone page can be toggled off cleanly without affecting other insight surfaces.
- The generalized card system (garden tracking, habit loops, personal agreements) will want its own analytics home. Drift is the first feature of that broader surface.

**Navigation path:** Sidebar → `Drift` (icon: a gentle wave or timeline arrow)

---

## 3. User-Level Opt-Out

Not everyone wants behavioral feedback surfaced back to them. This is respected at the individual user level — not the server level.

### 3.1 User Preference Field

```prisma
model User {
  // ... existing fields ...
  driftDashboardEnabled  Boolean  @default(true)  @map("drift_dashboard_enabled")
}
```

**Migration:** Non-breaking. Defaults to `true` for all existing users. The dashboard is on by default; any user can turn it off.

### 3.2 Settings UI

Location: `Settings → Personal → Insights`

```
┌─────────────────────────────────────────────────────────┐
│  Commitment Drift Dashboard                             │
│  Show patterns in task deferrals and completion timing  │
│                                              [Toggle ●] │
│                                                         │
│  When enabled, Tandem tracks when tasks are deferred    │
│  and when you tend to get things done — so you can      │
│  see your own patterns over time. All data stays on     │
│  your server. Nothing is shared externally.             │
│                                                         │
│    ┌─ When Drift Dashboard is enabled ────────────┐     │
│    │  Show Displacement Lens              [Toggle ●]│    │
│    │  When you defer a task, show what you         │    │
│    │  completed instead.                           │    │
│    └───────────────────────────────────────────────┘    │
│                                                         │
│    Breakdown signal after [4 ▾] deferrals               │
│    Suggest breaking a task into smaller pieces          │
│    when it has been deferred this many times.           │
└─────────────────────────────────────────────────────────┘
```

When disabled: the `Drift` nav item is hidden, all `/api/insights/drift/*` endpoints return 403, and drift counters continue running silently (so re-enabling shows accurate history).

---

## 4. Background: What the Data Already Captures

The event sourcing system already records most of what this feature needs:

| User Action | Event Already Recorded |
|---|---|
| Change `scheduledDate` forward | `TaskEvent { eventType: 'DEFERRED', changes: { scheduledDate: { old, new } } }` |
| Change `dueDate` forward | `TaskEvent { eventType: 'UPDATED', changes: { dueDate: { old, new } } }` |
| Mark task `DROPPED` | `TaskEvent { eventType: 'STATUS_CHANGED', changes: { status: { old, new: 'DROPPED' } } }` |
| Complete a task | `TaskEvent { eventType: 'COMPLETED', createdAt }` |

**Key implication:** No new event types are required. This feature is a query and aggregation layer on existing `TaskEvent` data.

---

## 5. Core Concepts

### 5.1 Drift

**Drift** is the cumulative displacement of a task's original commitment date. A task with a `dueDate` of January 1 that completes February 15 has drifted 45 days — whether that happened in one push or twelve small ones. Two axes:

- **Scheduled drift** — deferrals via `scheduledDate` ("not yet" decisions)
- **Due date drift** — deliberate extensions of the hard deadline
- **Total drift** — days from original `dueDate` to actual `completedAt` or current date

### 5.2 Breakdown Signal

When a task has been deferred **4 or more times**, the system surfaces a gentle suggestion that it may benefit from being broken into smaller actions. This is not a warning or failure flag — it is a redesign prompt.

> "This task has been deferred 4 times. Sometimes that means the first step isn't clear yet. Would you like to break it into smaller pieces?"

The threshold is configurable per-user in settings (default: 4). The suggestion appears inline on the task card and in the Drift dashboard — never as a notification or interruption.

### 5.3 Displacement

**Displacement** asks: when you deferred Task A, what were you doing instead? The implementation looks at tasks completed on the **same calendar day** as the deferral event and surfaces them as displaced alternatives — making the trade visible without assigning blame.

---

## 6. Time Windows

The dashboard supports four time windows. The selector is a segmented control in the page header, persistent per user session.

| Window | What It Shows | Comparison Available |
|---|---|---|
| **This Week** | Monday → today | vs. Last Week (side-by-side) |
| **Last Week** | Previous full Mon–Sun | vs. This Week (side-by-side) |
| **This Month** | 1st of month → today | vs. Last Month (side-by-side) |
| **Year to Date** | Jan 1 → today | Full trend only (no side-by-side) |

**Side-by-side comparison** is the primary UX pattern for the first three windows. "This Week" and "Last Week" render as two series on every chart — same axis, different visual treatment (solid vs. muted). This makes the "am I doing better than last week?" question immediately answerable without any mental arithmetic.

All charts are **read-only and informational.** There are no interactive inputs on the dashboard — no filters, no editable fields. The only control is the window selector in the header.

---

## 7. Dashboard Layout

```
┌───────────────────────────────────────────────────────────────────────┐
│  Commitment Drift                                                      │
│  [This Week]  [Last Week]  [This Month]  [Year to Date]               │
├──────────────────────────────┬────────────────────────────────────────┤
│  COMPLETIONS                 │  DEFERRALS                             │
│  Current period vs. prior    │  Current period vs. prior              │
│  (two-series bar/line chart) │  (two-series bar/line chart)           │
│                              │                                        │
├──────────────────────────────┴────────────────────────────────────────┤
│  TIME-OF-DAY HEATMAP                                                  │
│  When do you actually get things done?                                │
│  (grid: days × hours of day, color intensity = completions)           │
├──────────────────────────────────────────────────────────────────────┤
│  AREA DRIFT MAP                                                       │
│  Which areas of your life are drifting?                               │
│  (card grid, color intensity = drift score, spark-line per area)      │
├──────────────────────────────────────────────────────────────────────┤
│  MOST-DEFERRED TASKS                                                  │
│  (table: task, area, deferrals, total drift days, breakdown signal)   │
├──────────────────────────────────────────────────────────────────────┤
│  DISPLACEMENT LENS                                                    │
│  When you deferred [task], you completed these instead                │
│  (expandable rows for tasks with 3+ deferrals)                        │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 8. Completions Widget

Two-series chart comparing task completions between the current and previous period.

- **X-axis:** Days of week (Mon–Sun) for weekly windows; days of month for monthly; months for YTD
- **Y-axis:** Tasks completed (count)
- **Series 1:** Current period (solid)
- **Series 2:** Previous period (muted/dotted, same axis)

**Positive framing:** A small indicator below the chart reflects the comparison:
- New personal best → "🏆 Personal best this week"
- Matched prior period → "↔ Same as last week — steady" (holding volume is a win)
- Improved → "↑ X more tasks than last week"

The "steady" case is intentional: it is easy to change the number of cards completed while completing the same number of meaningful commitments. Holding steady counts.

For YTD, this becomes a monthly bar chart showing completion count per month — the full year of momentum at a glance.

---

## 9. Deferrals Widget

Mirror of the Completions widget but for deferral events.

- **X-axis:** Same temporal axis as Completions
- **Y-axis:** Deferral count
- **Series 1:** Current period
- **Series 2:** Previous period

When deferrals decrease period-over-period: "↓ X fewer deferrals than last week."

The Completions and Deferrals widgets sit side by side. The **visual relationship between the two** is the real signal: rising completions alongside falling deferrals means the system is working.

---

## 10. Time-of-Day Heatmap

A grid showing **when during the day tasks get completed**, across the selected window.

- **Rows:** Days of week (Mon–Sun) for weekly; days of month for monthly; months for YTD
- **Columns:** Hours of day (0–23, or grouped into 2-hour blocks for readability — 12 columns)
- **Cell color:** Count of completions in that day/hour slot. Empty = light neutral. More completions = deeper color (single-hue scale, not red/green)

This heatmap answers: *"When does my system actually fire?"*

A person who completes most tasks before 9am will see a vivid band in the early-morning columns. A person whose completions cluster on Sunday afternoons will see that. No interpretation is added to the heatmap — the pattern speaks for itself and the user draws their own conclusions.

**YTD layout:** Accessible via a "↕ See full year" expand or a "Year" tab within the heatmap card. Rows become months (Jan–Dec), columns remain 2-hour blocks. Reveals seasonal and time-of-day patterns across the full year. The default view always shows the current window (weekly/monthly grid) — the annual view is there when you want it, not always visible.

**API:**
```
GET /api/insights/drift/heatmap?window=this-week
```

Response:
```typescript
interface HeatmapCell {
  dayLabel: string;    // "Mon", "Tue" or "Jan 1", etc.
  hour: number;        // 0–23
  completions: number;
}
```

---

## 11. Area Drift Map

A card grid where each card represents a **GTD Area**. Color intensity reflects aggregate drift within the area over the selected window.

**Card content:**
- Area name
- Drift score (composite: deferrals + due-date pushes + total drift days, normalized 0–100)
- "X tasks drifted" count
- Small spark-line: 8 weeks of that area's weekly drift score

**Color scale:** Neutral gray (no drift) → warm amber (moderate) → deep orange (high). Deliberately avoids red-as-failure framing.

Cards are read-only. No click behavior. The Most-Deferred Tasks table below provides the detail view.

**YTD:** Spark-lines extend to show the full year — revealing seasonal patterns, project load spikes, and sustained streaks of low drift.

---

## 12. Most-Deferred Tasks Table

Sortable, read-only table of all tasks deferred at least once in the selected window.

| Column | Description |
|---|---|
| Task | Title |
| Area | GTD Area badge |
| Project | Parent project |
| Deferrals | `deferralCount` for the window |
| Date Pushes | `dueDatePushCount` for the window |
| Total Drift | Days from `originalDueDate` to today or `completedAt` |
| Status | Current status badge |
| Signal | Empty, or "↓ Break it down?" if deferrals ≥ threshold |

The **Breakdown Signal column** is purely informational — a gentle prompt visible in the table. No action is taken from the dashboard; the user acts on it by opening the task itself.

Default sort: Deferrals descending.

---

## 13. Displacement Lens

For tasks with 3+ deferrals, an expandable row shows what was completed instead during each deferral window.

```
▼ "Redesign Tandem pricing page"  [deferred 5×, 47 days total drift]

   When you deferred this, you completed:
   ──────────────────────────────────────────────────────────────
   Jan 12  →  Set up CI/CD pipeline          (Tandem Dev)
              Review OVH server capacity     (Infrastructure)

   Jan 19  →  Write weekly review notes
              Research Stripe pricing        (Tandem Dev)

   Feb 3   →  Tango workshop prep            (Tango Community)
              Catch up on MSIA coursework    (Studies)

   ──────────────────────────────────────────────────────────────
   Most frequent: Tandem Dev (3 tasks)  ·  Studies (2 tasks)
```

The "Most frequent" line is pure aggregation. No AI, no interpretation. The user draws their own conclusions about what the pattern means for them.

---

## 14. Data Model

### 14.1 Schema Additions

```prisma
model User {
  // ... existing fields ...
  driftDashboardEnabled    Boolean  @default(true)  @map("drift_dashboard_enabled")
  driftDisplacementEnabled Boolean  @default(true)  @map("drift_displacement_enabled")
  driftBreakdownThreshold  Int      @default(4)      @map("drift_breakdown_threshold")
}

model Task {
  // ... existing fields ...
  deferralCount     Int       @default(0)   @map("deferral_count")
  dueDatePushCount  Int       @default(0)   @map("due_date_push_count")
  originalDueDate   DateTime?              @map("original_due_date")
  totalDriftDays    Int       @default(0)   @map("total_drift_days")
}
```

**Migration:** Non-breaking. All new columns have defaults. A one-time backfill script populates existing data by replaying `TaskEvent` records per task.

### 14.2 Counter Maintenance

Incremented inside the existing `updateTask()` transaction in `task-service.ts`, immediately after the `TaskEvent` write:

```typescript
// Deferral: scheduledDate pushed forward
if (inferredEventType === 'DEFERRED') {
  await tx.task.update({
    where: { id: taskId },
    data: { deferralCount: { increment: 1 } },
  });
}

// Due date pushed forward
if (changes.dueDate && isForwardShift(changes.dueDate)) {
  await tx.task.update({
    where: { id: taskId },
    data: {
      dueDatePushCount: { increment: 1 },
      originalDueDate: task.originalDueDate
        ? undefined
        : new Date(changes.dueDate.old as string),
      totalDriftDays: computeDriftDays(
        task.originalDueDate ?? changes.dueDate.old,
        changes.dueDate.new
      ),
    },
  });
}
```

---

## 15. API Endpoints

All endpoints gate on `user.driftDashboardEnabled` and return `403` if disabled.

```
GET /api/insights/drift/completions          Two-series completions comparison
GET /api/insights/drift/deferrals            Two-series deferrals comparison
GET /api/insights/drift/heatmap              Time-of-day completion grid
GET /api/insights/drift/by-area              Area drift card data
GET /api/insights/drift/tasks                Most-deferred tasks table (paginated)
GET /api/insights/drift/displacement/:taskId Displacement lookup for a specific task
```

All endpoints accept `window` query param: `this-week`, `last-week`, `this-month`, `last-month`, `ytd`.

---

## 16. Implementation Phases

### Phase 1 — Data Foundation

- [ ] Add `driftDashboardEnabled` to `User`
- [ ] Add `deferralCount`, `dueDatePushCount`, `originalDueDate`, `totalDriftDays` to `Task`
- [ ] Write non-breaking migration
- [ ] Write backfill script: replay `TaskEvent` records to populate counters per task
- [ ] Update `updateTask()` in `task-service.ts` to increment counters on relevant changes
- [ ] Unit tests for counter accuracy against raw event queries

**Deliverable:** Drift counters accurate on all tasks going forward. Existing data backfilled.

### Phase 2 — API Layer

- [ ] All six API endpoints with correct window arithmetic
- [ ] `403` guard for `driftDashboardEnabled = false`
- [ ] Heatmap aggregation: `GROUP BY day, EXTRACT(hour FROM completed_at)`
- [ ] Area aggregation query
- [ ] Displacement lookup query (same calendar day as each deferral event)
- [ ] Integration tests with seed data covering typical drift patterns and edge cases (no data, single event, all-time-window)

**Deliverable:** All data available via API; verifiable with curl before any UI exists.

### Phase 3 — Dashboard UI

- [ ] Standalone `Drift` page with sidebar nav entry
- [ ] Window selector: This Week / Last Week / This Month / YTD
- [ ] Completions widget (two-series comparison chart)
- [ ] Deferrals widget (two-series comparison chart)
- [ ] Time-of-Day Heatmap component
- [ ] Area Drift Map card grid with spark-lines
- [ ] Most-Deferred Tasks table with breakdown signal column
- [ ] Displacement Lens expandable rows

**Deliverable:** Full read-only dashboard.

### Phase 4 — Integration & Settings

- [ ] Drift opt-out toggle in `Settings → Personal → Insights`
- [ ] Hide `Drift` nav item when `driftDashboardEnabled = false`
- [ ] Breakdown signal on task cards (inline, never a notification)
- [ ] Weekly review: "Recurring deferrals" section with Keep / Redefine / Drop actions
- [ ] MCP tool: `tandem_drift_summary`

**Deliverable:** Feature fully integrated into existing surfaces.

---

## 17. MCP Integration

```typescript
{
  name: "tandem_drift_summary",
  description:
    "Returns commitment drift patterns: most-deferred tasks, area drift scores, " +
    "and time-of-day completion patterns. Useful for weekly reviews, reflection " +
    "prompts, or identifying where the GTD system needs redesign.",
  inputSchema: {
    type: "object",
    properties: {
      window: {
        type: "string",
        enum: ["this-week", "last-week", "this-month", "ytd"],
        description: "Time window for analysis (default: this-week)"
      },
      limit: {
        type: "number",
        description: "Max tasks to return (default: 10)"
      }
    }
  }
}
```

---

## 18. Resolved Design Decisions

All questions from the initial draft review are now locked.

1. **Breakdown threshold** — **Default: 4 deferrals. Configurable per-user in settings (range: 2–10).** Ships at 4. User can adjust in `Settings → Personal → Insights`.

2. **Displacement window** — **Exactly one calendar day (±0, same day as the deferral event).** If a task was deferred on Tuesday, the displacement lookup covers completions on that same Tuesday. This is tight and intentional — "I deferred it and did these things instead today."

3. **YTD heatmap layout** — **Implemented as a tab or expand section within the heatmap component**, not a separate page. The default view shows the current window (weekly/monthly grid). A "↕ See full year" expand or "Year" tab within the heatmap card reveals the month × hour layout for users who want to look back further. This keeps the primary view clean while making the annual pattern accessible.

4. **Spark-line query cost** — **Start with batched single query grouped by `(areaId, week)`.** Evaluate during testing whether the aggregation cost warrants caching. Adjust if needed — no premature optimization.

5. **Positive milestone markers** — **Yes, include personal best markers.** Completing the same number of tasks as the prior period also counts as a positive signal — volume can change while completion rate holds steady, and holding steady is worth acknowledging. Marker logic:
   - New personal best (most completions ever in a single period) → star marker + "🏆 Personal best"
   - Matched prior period exactly → neutral positive indicator + "↔ Same as last week — steady"
   - Improved over prior period → "↑ X more than last week"

6. **Displacement sub-toggle** — **Yes, separate sub-toggle.** Ships enabled by default. Location: `Settings → Personal → Insights`, nested under the main Drift Dashboard toggle. Label: `Show Displacement Lens` with description: "When you defer a task, show what you completed instead."

---

## 19. Design Principles

**Purely observational.** The dashboard contains no inputs. No editing, no filtering, no action buttons. It is a mirror, not a control surface.

**Positive by default.** Improvement — even microscopic improvement — is surfaced first. The language celebrates momentum before surfacing where drift increased.

**No new capture burden.** Zero additional user input required. Everything derives from actions already taken in the normal use of Tandem.

**Drift as redesign signal.** A task deferred four times is not evidence of failure. It may mean the first step is unclear, the task is larger than it looks, or the commitment no longer reflects what matters. The Breakdown Signal makes that reframe available — gently, at the right moment, never as an interruption.

**Opt-in to feedback.** On by default, but any user can disable it permanently with one toggle. No data is lost; counters keep running silently. Re-enabling restores full history.

**Generalized architecture.** The data model — completions, deferrals, time-of-day heatmap, area grouping — applies equally to garden tracking cards, habit loops, or any card-based commitment tracking system Tandem supports in the future. This dashboard is designed to grow with the generalized card model, not just GTD tasks.

---

*© 2025-2026 Courtemanche Atelier*
