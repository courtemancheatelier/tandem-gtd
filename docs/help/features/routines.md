---
title: Routines
category: Features
tags: [routines, supplements, medication, dosing, compliance, windows, tracking, checklists]
sortOrder: 11
---

# Routines (Windowed)

Windowed routines let you track multi-item regimens with timed windows, per-item check-off, dynamic dosing, and compliance tracking. They're ideal for supplement stacks, medication schedules, spiritual practices, garden tasks, and any recurring checklist.

Unlike simple recurring cards (which generate a single task), a windowed routine groups multiple **windows** throughout the day, each containing specific **items** with dosages or steps. You check off windows (or individual items) as you go.

---

## Key Concepts

| Concept | What It Is |
|---------|------------|
| **Routine** | The overall regimen (e.g., "Daily Supplement Stack" or "Walking in the Light") |
| **Window** | A timed slot within the day (e.g., "7:00 AM — Empty Stomach") |
| **Item** | A specific supplement, medication, or step within a window (e.g., "Creatine 5g") |
| **Log** | A daily record of what was completed, skipped, or missed per window |

---

## Creating a Windowed Routine

Go to **Settings > Routines** and click **New Routine**. Select **Windowed** mode.

### Routine Fields

- **Title** — name of the routine (e.g., "Daily Supplements")
- **Description** — optional notes about the routine
- **Schedule** — how often it recurs (daily, weekdays, etc.)
- **Window Type** — Health, Chores, Spiritual, or General (affects item fields shown)
- **Routine Type** — **Static** (same dosages every day) or **Dynamic** (dosages change over time)
- **Card Color** — color stripe shown on the card in Card File
- **Time Estimate** — total minutes for all windows combined
- **Area / Goal** — link to a GTD area of responsibility or goal

### Dynamic Routine Fields

When you select **Dynamic** as the routine type, additional fields appear:

- **Start Date** — when the routine begins (Day 1)
- **Total Days** — how many days the routine runs (e.g., 18 for a cleanse)

Dynamic routines auto-deactivate when they reach their total day count.

### Adding Windows

Click **Add Window** to create timed slots within the day. Each window has:

- **Title** — what the window represents (e.g., "Morning — Empty Stomach")
- **Target Time** — display hint for when to take items (e.g., "7:00 AM")
- **Constraint** — optional context like "empty stomach", "with food", or "post-workout"

### Adding Items

Within each window, click **Add Item** to add supplements, medications, or steps:

- **Name** — the supplement, medication, or step name
- **Dosage** — the amount (e.g., "5g", "2 caps", "1 scoop")
- **Form** — optional: capsule, powder, liquid, softgel, tablet
- **Notes** — optional instructions (e.g., "Mix with water")

### Dynamic Dosing (Ramp Schedules)

For **dynamic routines**, each item can have a ramp schedule that changes the dosage over the course of the routine. Add ramp steps to define dosage changes:

| From Day | To Day | Dosage |
|----------|--------|--------|
| 1 | 2 | 1 cap |
| 3 | 7 | 2 caps |
| 8 | 14 | 3 caps |

On the Card File, the card will show today's specific dosage computed from the ramp schedule. If the dosage changed from yesterday, a **(changed)** indicator appears next to the item.

---

## Using Routine Cards

Routine cards appear in the **Card File** alongside your simple recurring cards, and in **Do Now** when they are actionable. Each card shows all windows for the day.

### Window-Level Actions

- **Check the checkbox** next to a window title to mark the entire window as completed
- **Skip** (fast-forward icon) to mark a window as skipped
- **Complete All Windows** button at the bottom marks all remaining windows as completed

### Per-Item Check-Off

You can also check off individual items within a window:

- Small checkboxes appear next to each item name
- Check items as you take them throughout the day
- When some items are checked, the window shows a **partial** badge with an amber border
- When all items in a window are checked, the window auto-completes

### Status Indicators

| Status | Appearance |
|--------|------------|
| **Pending** | Default border, unchecked |
| **Partial** | Amber border, "partial" badge, checked items show strikethrough |
| **Completed** | Muted background, checkbox checked, items struck through |
| **Skipped** | Muted background, "skipped" badge |

### Dynamic Routine Cards

For dynamic routines, the card title shows the current day number (e.g., "Para Cleanse — Day 5 of 18") and each item displays its dosage for that specific day.

---

## Compliance Dashboard

Track your adherence over time from **Settings > Routines** — click the chart icon next to any windowed routine.

### What It Shows

- **Completion Rate** — percentage of windows completed across the selected time range
- **Current Streak** — consecutive days with all windows completed (partial counts)
- **Best Streak** — your longest streak in the selected range
- **Days Tracked** — total days the routine has been active

### Per-Window Adherence

Each window shows its own completion bar and percentage. This helps you identify your weak spots — maybe you never miss your morning window but frequently skip the afternoon one.

### Daily Grid

A day-by-day grid shows the status of each window with color-coded dots:

| Color | Meaning |
|-------|---------|
| Green | Completed |
| Yellow | Skipped or Partial |
| Red | Missed |

### Time Range

Switch between **7 days**, **30 days**, and **90 days** to see different views of your compliance.

---

## Missed Windows

At the end of each day, any windows that were not checked off are automatically marked as **missed** in the compliance log. This happens via a background process and ensures your compliance data is accurate even when you forget to check the app.

---

## Tips

- **Start with one routine** — add your current supplement stack first, then expand
- **Use target times** — they appear on the card as reminders, even though they're not enforced
- **Check items individually** — if you take supplements at different times within a window, use per-item checkboxes instead of completing the whole window at once
- **Review compliance weekly** — the compliance dashboard helps you spot patterns. If a window consistently shows low adherence, consider adjusting the schedule or items
- **Dynamic routines end automatically** — when a dynamic routine reaches its total day count, it deactivates and stops generating cards

---

## See Also

- [[card-file-recurring|Card File & Recurring Cards]] — the broader recurring card system, simple routines, template packs
- [[what-is-gtd|What Is GTD?]] — the methodology behind Tandem
