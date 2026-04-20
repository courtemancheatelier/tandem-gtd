---
title: Commitment Drift
category: Features
tags: [drift, deferrals, analytics, insights, heatmap, displacement, patterns]
sortOrder: 11
---

# Commitment Drift

The Commitment Drift dashboard helps you understand deferral patterns — what you keep pushing off, when you're most productive, and what displaces your commitments. It turns raw task history into visual patterns so you can make better decisions about what to commit to.

Navigate to **Insights > Commitment Drift** in the sidebar.

---

## Time Windows

Use the tabs in the top-right to select the analysis period:

| Window | What It Shows |
|--------|--------------|
| **This Week** | Current ISO week (Mon–Sun), with prior-week comparison |
| **Last Week** | Previous ISO week, with the week before as comparison |
| **This Month** | Current calendar month, with prior-month comparison |
| **YTD** | January 1 to today (no comparison period) |

Widgets that support two-period comparison show a trend indicator (e.g., "+12%" or "-5%").

---

## Filters

Below the header, three dropdowns let you scope all widgets to a subset of your data:

- **Area** — filter by GTD area of responsibility (e.g., "Health & Fitness")
- **Goal** — filter by active goal
- **Card File** — filter by a specific routine/Card File

Filters are stored in the URL (`?area=X&goal=Y&routine=Z`), so you can bookmark filtered views. Click **Clear Filters** to return to the aggregate view.

Area filtering works for both project-linked tasks and Card File tasks — a Card File task's area comes from its routine's area assignment.

---

## Widgets

### Outcome Summary

Three cards showing how tasks scheduled in the current window turned out:

- **Completed** — tasks marked done
- **Skipped / Deferred** — tasks with deferrals or dropped status
- **Expired Untouched** — tasks whose date passed with no action taken. These link directly to the task in Do Now so you can address them.

### Completions & Deferrals

Side-by-side bar charts comparing the current period to the prior period. Completions trending up and deferrals trending down is the healthy pattern. The trend percentage tells you the direction at a glance.

### Completion Heatmap

A grid showing when you complete tasks, broken into 2-hour blocks:

- **Weekly views** — rows are days of the week (Mon–Sun)
- **Monthly view** — rows are calendar dates
- **YTD** — rows are months

Darker cells mean more completions. Use this to identify your productive hours and schedule demanding tasks accordingly.

### Drift by Area

Cards for each GTD area showing:

- **Drift Score** (0–100) — percentage of tasks in that area with at least one deferral or due-date push
- **Drifted task count** — how many tasks have been deferred
- **8-week sparkline** — weekly deferral trend

Includes both project tasks and Card File tasks linked to each area. Click any area card to apply it as a filter — all widgets will scope to that area.

### Most Deferred

A sortable table of your top 50 most-deferred tasks. Columns:

- **Task** — click to navigate to the task in Do Now
- **Area** — the task's area (from project or routine)
- **Source** — the project or Card File name
- **Deferrals / Pushes / Drift Days** — click column headers to sort
- **Signal** — a "Break down" indicator appears when a task has been deferred more than your breakdown threshold (default: 4 times), suggesting the task may be too large

### Displacement Lens

For tasks with 3+ deferrals, expand the row to see what you completed on each day you deferred that task. This answers the question: "What displaces this commitment?" It shows the most common competing area to help you understand priority conflicts.

---

## Collapsible Sections

Each widget section has a collapse toggle (chevron). Click the section header to expand or collapse it. Your preferences are saved in your browser and persist across page reloads — useful for focusing on the widgets you check most often.

---

## How Drift Data Is Tracked

Drift data comes from existing task events — no extra tracking is needed:

- **Deferrals** are recorded when you skip or snooze a Card File task, or when a task event with type DEFERRED is created
- **Due-date pushes** are counted when a task's due date is moved forward
- **Drift days** accumulate as the difference between the original and current due date

These counters are on each task (`deferralCount`, `dueDatePushCount`, `totalDriftDays`) and update automatically as you work.

---

## Tips

- **Check weekly** — the drift dashboard is most useful as a weekly review tool. Look at "Last Week" during your weekly review to spot patterns.
- **Watch the sparklines** — an upward sparkline in an area means deferral frequency is increasing. Investigate before it becomes a habit.
- **Use the breakdown signal** — if a task keeps getting deferred, it's often too vague or too large. Break it into smaller, concrete next actions.
- **Filter by Card File** — isolate a single routine to see its completion and deferral history over time.
- **Don't chase zero drift** — some deferral is healthy prioritization. The goal is awareness, not perfection.

---

## See Also

- [[card-file-recurring|Card File & Recurring Cards]] — the recurring task system that feeds drift data
- [[routines|Routines]] — windowed routines with multi-item checklists
- [[organize|Organize]] — how tasks, projects, and areas fit together
- [[horizons-of-focus|Horizons of Focus]] — connecting areas to life goals
