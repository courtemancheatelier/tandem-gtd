# Tandem — Enhanced Velocity Chart Spec

**Date:** March 1, 2026  
**Extends:** PM_FEATURES.md §5.1 (Velocity Tracker widget)  
**Status:** Draft for review

---

## Overview

The current velocity widget shows task completion count per week with a rolling average. This spec enhances it with per-project unit selection (tasks vs. hours), auto-detection of the appropriate unit, configurable lookback windows, scope change annotations, and a direct connection to burndown projected completion.

### The Core Problem

A week where you complete 20 two-minute phone calls looks identical to a week where you complete 3 eight-hour deep work sessions — both show "completions went up/down" without reflecting actual throughput. Projects track effort differently: some have well-estimated tasks where hours tell the real story, others are quick-capture lists where count is the only meaningful signal.

---

## 1. Per-Project Velocity Unit

### 1.1 Data Model

Add a `velocityUnit` field to the Project model:

```prisma
model Project {
  // ... existing fields ...

  /// How velocity is measured for this project.
  /// TASKS = count of completed tasks (default)
  /// HOURS = sum of estimatedMins on completed tasks
  /// AUTO  = system picks based on estimate coverage
  velocityUnit  VelocityUnit @default(AUTO) @map("velocity_unit")
}

enum VelocityUnit {
  TASKS
  HOURS
  AUTO
}
```

**Migration:** Non-breaking. Default `AUTO` for all existing projects. Add column with `@default(AUTO)`.

### 1.2 AUTO Detection Logic

When `velocityUnit` is `AUTO`, the system evaluates at query time:

```typescript
function resolveVelocityUnit(project: {
  tasks: { estimatedMins: number | null }[];
}): 'TASKS' | 'HOURS' {
  const total = project.tasks.length;
  if (total === 0) return 'TASKS';

  const withEstimates = project.tasks.filter(t => t.estimatedMins && t.estimatedMins > 0).length;
  const coverage = withEstimates / total;

  // Use hours when 80%+ of tasks have time estimates
  return coverage >= 0.8 ? 'HOURS' : 'TASKS';
}
```

The 80% threshold prevents misleading hours-based velocity when most tasks lack estimates. The resolved unit is included in the API response so the frontend doesn't need to recompute.

### 1.3 UI: Project Settings

Add a "Velocity tracking" option to the project settings/edit form:

```
Velocity Unit:
  (●) Auto-detect     — Uses hours when 80%+ of tasks have time estimates
  ( ) Task count       — Count completed tasks per period
  ( ) Hours            — Sum estimated hours of completed tasks per period
```

Place this in the existing project edit panel alongside type (Sequential/Parallel/Single Actions) and outcome fields.

---

## 2. Configurable Lookback Window

### 2.1 Lookback Options

The velocity widget currently hardcodes a 12-week window. Add a selector with preset ranges:

| Label | Weeks | Use Case |
|-------|-------|----------|
| **4 weeks** | 4 | Recent trend, sprint-like cadence |
| **12 weeks** | 12 | Default, quarterly view |
| **26 weeks** | 26 | Seasonal patterns, long-running projects |

### 2.2 API Changes

Update the dashboard stats endpoint to accept a `velocityWeeks` parameter:

```
GET /api/dashboard/stats?velocityWeeks=12
```

Default: `12`. Accepted values: `4`, `12`, `26`.

The velocity response shape gains `resolvedUnit` and `lookbackWeeks`:

```typescript
velocity: {
  data: {
    week: string;           // ISO date (Monday of the week)
    completedCount: number; // Always populated
    completedMins: number;  // Always populated
  }[];
  averagePerWeek: number;   // Average in the resolved unit
  resolvedUnit: 'TASKS' | 'HOURS';
  lookbackWeeks: number;
}
```

`averagePerWeek` reflects the resolved unit: task count average when unit is `TASKS`, hours average (completedMins / 60, rounded to 1 decimal) when unit is `HOURS`.

### 2.3 Per-Project Velocity Endpoint

Add a project-scoped velocity endpoint for the project detail view:

```
GET /api/projects/:id/velocity?weeks=12
```

Returns the same shape as the dashboard velocity but filtered to tasks within that project (and its sub-projects via the materialized `path` field). Uses the project's `velocityUnit` setting for unit resolution.

---

## 3. Scope Change Annotations

### 3.1 What to Track

When tasks are added to or removed from a project during a velocity window, mark those weeks. This prevents misinterpreting scope changes as productivity changes.

Track scope changes by comparing task count at the start and end of each week window:

```typescript
interface VelocityWeekData {
  week: string;
  completedCount: number;
  completedMins: number;
  scopeChange?: {
    tasksAdded: number;    // Tasks created or moved into project this week
    tasksRemoved: number;  // Tasks deleted or moved out of project this week
    net: number;           // tasksAdded - tasksRemoved
  };
}
```

### 3.2 Data Source

Use the existing event sourcing / task history system to count:
- Tasks with `createdAt` within the week AND `projectId` matching
- Tasks moved into the project (history event showing projectId change)
- Tasks deleted or moved out (history event showing projectId cleared or changed)

For the dashboard-level (all projects) view, aggregate scope changes across all active projects.

### 3.3 Visual Treatment

On the velocity chart, render scope change weeks with a vertical dotted line annotation:

- **Net positive** (tasks added): Dotted line with small label above chart area: "+5 tasks added"
- **Net negative** (tasks removed): Dotted line with label: "−3 tasks removed"
- **Threshold:** Only show annotations when `|net| >= 3` to avoid noise on every single task creation

Color: `#94A3B8` (slate-400) — same as the existing ideal burndown line, keeping annotations visually secondary to the actual data.

---

## 4. Burndown Integration

### 4.1 Projected Completion from Velocity

The velocity average directly feeds the burndown chart's projected completion line. Make this connection explicit:

```typescript
function projectCompletionDate(
  remainingWork: number,        // hours or task count, matching velocity unit
  velocityPerWeek: number,      // from velocity averagePerWeek
  unit: 'TASKS' | 'HOURS'
): Date | null {
  if (velocityPerWeek <= 0) return null;

  const weeksRemaining = remainingWork / velocityPerWeek;
  const completionDate = new Date();
  completionDate.setDate(completionDate.getDate() + Math.ceil(weeksRemaining * 7));
  return completionDate;
}
```

### 4.2 Burndown Tooltip Enhancement

When hovering the projected completion line on the burndown chart, show:

```
Projected completion: April 18, 2026
Based on velocity: 8.5 hrs/week (12-week avg)
Remaining: 42 hours across 18 tasks
```

This connects the two charts without requiring users to mentally compute the relationship.

### 4.3 Unit Consistency

The burndown and velocity charts for a given project must use the same unit. When `velocityUnit` is `HOURS`:
- Burndown Y-axis: remaining hours (`sum of estimatedMins / 60` for incomplete tasks)
- Velocity Y-axis: completed hours per week

When `velocityUnit` is `TASKS`:
- Burndown Y-axis: remaining task count
- Velocity Y-axis: completed task count per week

The existing burndown implementation already uses hours. When unit is `TASKS`, switch to task count for both axes. The ideal burndown line recalculates accordingly.

---

## 5. Updated Widget Component

### 5.1 Widget Header Changes

```
┌─────────────────────────────────────────────┐
│  Velocity                    [4w ▾]         │
│  Last 12 weeks · tasks/week                 │
│                                       8.2   │
│                                    avg/week  │
│                                              │
│  ┃     ┃           ╎                        │
│  ┃  ┃  ┃  ┃     ┃  ╎  ┃                    │
│  ┃  ┃  ┃  ┃  ┃  ┃  ╎  ┃  ┃  ┃  ┃  ┃  ┃   │
│  ─────────────────────────────── avg ─────  │
│  W1 W2 W3 W4 W5 W6 W7 W8 W9 ...     W12   │
│                     ╎                        │
│                  +7 tasks                    │
│                   added                      │
└─────────────────────────────────────────────┘
```

Changes from current implementation:
- **Lookback selector**: Dropdown in top-right corner (4w / 12w / 26w)
- **Unit label**: Subtitle shows "tasks/week" or "hrs/week" based on resolved unit
- **Scope annotations**: Vertical dotted lines with labels on weeks with significant scope changes
- **Average line**: Already implemented, no change needed

### 5.2 Dual Display on Hover

The tooltip already shows `completedCount`. Enhance it to show both metrics regardless of the active unit:

```
Week of Mar 3, 2026
  Tasks completed: 12
  Hours completed: 8.5h
```

This lets users see the secondary metric without switching units.

### 5.3 Trend Indicator Logic

```typescript
function computeTrend(data: VelocityWeekData[], resolvedUnit: 'TASKS' | 'HOURS') {
  if (data.length < 4) return null;

  const getValue = (d: VelocityWeekData) =>
    resolvedUnit === 'HOURS' ? d.completedMins / 60 : d.completedCount;

  const recent4 = data.slice(-4);
  const previous4 = data.slice(-8, -4);

  if (previous4.length < 4) return null;

  const recentAvg = recent4.reduce((s, d) => s + getValue(d), 0) / 4;
  const previousAvg = previous4.reduce((s, d) => s + getValue(d), 0) / 4;

  if (previousAvg === 0) return null;

  const changePercent = ((recentAvg - previousAvg) / previousAvg) * 100;

  return {
    direction: changePercent >= 0 ? 'up' as const : 'down' as const,
    percent: Math.abs(Math.round(changePercent)),
  };
}
```

Display: green ▲ 12% or red ▼ 8% next to the average metric. Threshold: only show when `|changePercent| >= 5%` to avoid flickering on small variations.

---

## 6. Implementation Checklist

### Phase 1: Data Model & API

- [ ] Add `VelocityUnit` enum and `velocityUnit` field to Project model
- [ ] Write Prisma migration (non-breaking, default AUTO)
- [ ] Update `/api/dashboard/stats` to accept `velocityWeeks` param
- [ ] Add `resolvedUnit` and `lookbackWeeks` to velocity response shape
- [ ] Implement `resolveVelocityUnit()` with 80% coverage threshold
- [ ] Build `/api/projects/:id/velocity` endpoint
- [ ] Add scope change tracking query (task creation/deletion per week)

### Phase 2: Widget Enhancement

- [ ] Add lookback window dropdown to VelocityWidget header
- [ ] Update Y-axis and labels to reflect resolved unit (tasks vs. hours)
- [ ] Add scope change annotation rendering (vertical dotted lines)
- [ ] Enhance tooltip to show both task count and hours
- [ ] Implement trend indicator with 5% threshold
- [ ] Add velocity unit selector to project edit form

### Phase 3: Burndown Connection

- [ ] Implement `projectCompletionDate()` calculation
- [ ] Add projected completion tooltip to burndown chart
- [ ] Ensure burndown Y-axis matches project velocity unit
- [ ] Update burndown ideal line calculation for task-count mode

---

## 7. Open Questions

1. **Dashboard-level unit when projects differ.** The dashboard velocity widget aggregates across all active projects. If Project A uses tasks and Project B uses hours, what does the dashboard show? **Proposed:** Dashboard always shows task count (universal denominator). Project-level views use the project's configured unit.

2. **Historical unit changes.** If a user switches a project from TASKS to HOURS mid-stream, should the chart retroactively recalculate historical weeks in hours? **Proposed:** Yes — the raw data (`completedCount` and `completedMins`) is always stored for both. Switching units just changes which field drives the Y-axis. No data loss.

3. **Team velocity.** When teams ship (v1.1+), should velocity be per-member or aggregate? **Proposed:** Both. Default shows team aggregate. Optional "per member" toggle for admins/leads. Defer implementation to the teams spec.
