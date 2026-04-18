---
title: Project Charts — Burn-Down, Burn-Up & Velocity
category: Features
tags: [projects, burn-down, burn-up, velocity, estimates, charts, scope]
sortOrder: 7
---

# Project Charts — Burn-Down, Burn-Up & Velocity

Every project includes a collapsible **Charts** section with three views: **Burn-Down**, **Burn-Up**, and **Velocity**. Together they answer: how much work remains, is scope growing faster than progress, and what's my pace?

---

## Finding the Charts

1. Open any project from the **Projects** page
2. Look for the **Charts** section below the Goal/Area selectors
3. Click to expand — data loads on demand
4. Switch between views using the **Burn-Down**, **Burn-Up**, and **Velocity** tabs

Charts update automatically whenever you complete, add, or modify tasks while the section is expanded.

### Unit Toggle

A **Tasks / Hours** toggle lets you switch between:

- **Tasks** — counts completed or remaining tasks
- **Hours** — uses the `estimatedMins` field on each task, converted to hours

All three charts respect the selected unit so the numbers stay consistent.

---

## Burn-Down Chart

Shows how much work remains with three lines to help you understand whether you're on track.

### Actual Line (blue, solid)

The **remaining work** across all tasks in the project (including sub-project tasks, up to 2 levels deep). This line moves down as you complete tasks.

- Only non-dropped tasks count toward the total
- Shows the last **30 days** of history at weekly intervals

### Target Line (amber, dashed)

When a project has a **target date**, a straight line from the starting total down to zero at the target date. This is the pace you'd need to maintain to finish by your goal date.

- If Actual is **above** the Target line, you're behind schedule
- If Actual is **below** the Target line, you're ahead of schedule

### Ideal Line (green, dashed)

A velocity-based line showing what's **realistic** given your recent pace. Uses the last 4 weeks of completed work to project when remaining work will hit zero, then draws a straight line from the project start to that date.

- Compare this with the Target line: if Ideal is to the right of Target, your current pace won't meet the deadline
- The line extends into the future so you can see where it lands

### Today Line (red, dashed)

A vertical reference line marking the current date. Historical data appears to the left, projections to the right.

### Projected Completion Badge

When enough velocity data exists, a badge appears showing:

- **Projected: Mar 15** — the estimated completion date
- **10d away** — days until projected completion
- **1.5h/wk pace** — your current velocity (or tasks/wk in task mode)

---

## Burn-Up Chart

Shows whether your progress is keeping up with scope changes. Unlike burn-down (which only shows remaining work), burn-up reveals when a project is growing faster than you're completing it.

### Scope Line (rose, solid)

The **total work** in the project over time. This line goes up when tasks are added and down when tasks are removed or dropped.

### Completed Line (blue, solid)

The **work finished** over time. This line only goes up as you complete tasks.

### Ideal Line (green, dashed)

When a project has a **target date**, shows the ideal completion pace from the start to the target.

### Projected Lines (dashed)

- **Projected completion** (blue, dashed) — where completed work is heading based on recent velocity
- **Projected scope** (rose, dashed) — where total scope is heading based on recent additions

### Convergence Badge

The badge at the top of the chart tells you when the completed line will meet the scope line:

- **"Converging — lines meet ~Apr 18"** — you're completing work faster than scope is growing
- **"Diverging — scope outpacing work"** — scope is growing faster than you're completing; the project won't finish at the current rate

### Scope Change Annotations

Vertical markers highlight weeks where scope changed significantly (more than 10% of the project's peak size). Hover to see what changed.

---

## Velocity Chart

Shows your completion rate per week as an area chart so you can see trends in your pace.

### Weekly Bars

Each bar represents one week's completed work — either task count or hours, depending on the unit toggle.

### Average Line (dashed)

A horizontal reference showing your average velocity across the visible window.

### Trend Indicator

A badge showing whether your pace is increasing or decreasing:

- **Green arrow up** — e.g., "12% faster than previous 4 weeks"
- **Red arrow down** — e.g., "8% slower than previous 4 weeks"

Only appears when the change is 5% or more to avoid noise.

### Scope Change Annotations

Vertical dotted lines mark weeks where 3 or more tasks were added to or removed from the project. This helps explain velocity dips or spikes — a week with many new tasks added isn't a slowdown, it's a scope change.

### Tooltip

Hovering any week shows both metrics regardless of the active unit:

- **Tasks completed: 12**
- **Hours completed: 8.5h**

---

## How Velocity Is Calculated

Velocity is based on the **last 4 weeks** of completed tasks within the project:

1. Sum up completed work (task count or `estimatedMins`) for the last 4 weeks
2. Divide by the number of weeks to get your pace
3. The projection divides remaining work by this velocity to estimate weeks until completion

> **Note:** The 4-week window keeps projections responsive to recent changes. The velocity chart itself shows up to 12 weeks of history for a fuller picture.

---

## What You Need for Accurate Charts

### In Task Mode

Every completed task counts as 1 unit — no extra setup needed. This works well for projects with similarly-sized tasks.

### In Hours Mode

Charts rely on **time estimates** on your tasks:

- Tasks without `estimatedMins` contribute **0 hours** to both totals and velocity
- A warning appears when more than 30% of tasks lack estimates
- A project with no estimated tasks shows **"No estimated tasks to chart"**

### Tips

- **Estimate in round numbers** — 15min, 30min, 1h, 2h. Precision isn't important; relative sizing is.
- **Update estimates as you learn** — if a task turns out bigger than expected, update it. The chart reflects the current total.
- **Sub-project tasks count** — charts aggregate tasks from the project and all sub-projects (up to 2 levels deep).
- **Use task mode for quick-capture projects** — if most tasks don't have time estimates, task count gives a more honest picture than hours.
- **Use hours mode for well-planned projects** — when 80%+ of tasks have estimates, hours reflect actual throughput better than count.

---

## Project Dates

Projects have three date fields that influence charts and tracking:

- **Start date** — automatically set when a project is moved to **Active** status (if not already set). You can also set it manually.
- **End date** — automatically set when a project is **Completed** or **Dropped**. Cleared if you reactivate the project.
- **Target date** — set by you to indicate when you'd like the project to be done. This anchors the Target line on the burn-down chart.

The burn-down chart uses the start date (or project creation date if no start date) as the origin for the Target and Ideal lines.

---

## When All Tasks Are Complete

When every task is done, remaining work drops to zero. The projected completion badge disappears, the burn-down actual line sits flat at the bottom, and the burn-up completed line meets the scope line — your project is done.
