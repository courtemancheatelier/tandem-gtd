---
title: Card File & Recurring Templates
category: Features
tags: [card-file, recurring, templates, habits, routines, SHE, packs]
sortOrder: 10
---

# Card File & Recurring Templates

The Card File is Tandem's system for managing recurring tasks — things you do daily, weekly, monthly, or seasonally. Inspired by the SHE (Sidetracked Home Executives) index card system, it turns routines into cards that cycle automatically: complete a card today, and it reappears on its next scheduled date.

---

## How It Works

1. **Create a recurring template** — define the task, schedule, and optional defaults
2. **A task is generated** — it appears in your Card File on the scheduled date
3. **Complete (or skip) the card** — the template recycles and generates the next occurrence
4. **Repeat forever** — until you pause or delete the template

Templates live in **Settings > Recurring Templates**. The generated tasks appear in **Card File** (under GTD in the sidebar).

---

## Card File View

Navigate to **Card File** in the GTD section of the sidebar. Cards are sorted into three groups:

| Section | Meaning |
|---------|---------|
| **Overdue** | Cards whose scheduled date has passed — handle these first |
| **Today's Cards** | Cards due today |
| **Upcoming** | Cards scheduled for future dates |

Each card shows its title, schedule label, color stripe, and time estimate. You can:

- **Complete** — marks the task done and generates the next occurrence
- **Skip** — drops this occurrence and generates the next one
- **Defer** — pushes the card to a later date you choose

---

## Creating Templates

Go to **Settings > Recurring Templates** and click **New Template**.

### Basic Fields

- **Task Title** — what appears on each generated card (e.g., "Vacuum all floors")
- **Description** — optional notes added to each generated task
- **Schedule** — how often the task recurs

### Schedules

| Schedule | Example | Expression |
|----------|---------|------------|
| Every day | Daily habits | `daily` |
| Weekdays | Mon-Fri only | `weekdays` |
| Weekly | Every Saturday | `weekly:6` |
| Biweekly | Every other Monday | `biweekly:1` |
| Monthly | 1st of the month | `monthly:1` |
| Quarterly | Start of each quarter | `quarterly:1` |
| Yearly | March 1st each year | `yearly:3:1` |
| Every N days | Every 3 days | `every_n_days:3` |

### Card Color & Time Estimate

- **Card Color** — the color stripe shown on the card in Card File view. Use colors to group by frequency (e.g., yellow for daily, blue for weekly)
- **Time Estimate** — minutes per occurrence. Shown on the card and applied to generated tasks

### Horizons

Link the template to an **Area of Responsibility** or **Goal** from your GTD horizons. This is organizational — it helps you see which routines support which life areas.

### Task Defaults

Defaults applied to every generated task:

- **Project** — assign generated tasks to a project
- **Context** — set a GTD context (e.g., @Home, @Errands)
- **Energy Level** — LOW, MEDIUM, or HIGH

---

## Template Packs

Template packs are pre-built sets of templates you can load in one click. They appear in the empty state of both the Card File and the Recurring Templates settings page.

### Available Packs

**Running a House** (22 templates)
A complete household maintenance system covering daily tidying, weekly cleaning, monthly deep cleans, and seasonal maintenance. Color-coded by frequency: yellow (daily), blue (weekly/biweekly), gray (monthly), pink (quarterly/yearly).

**Small Garden** (12 templates)
Daily watering through seasonal planning for a backyard or patio garden. Color-coded: yellow (daily), green (weekly), gray (monthly), pink (quarterly/yearly).

### Loading a Pack

1. Navigate to **Card File** or **Settings > Recurring Templates**
2. If you have no templates, pack cards appear automatically
3. Click **Load Pack** on the pack you want
4. All templates are created and daily tasks appear in your Card File immediately

You can load multiple packs — they combine. Edit or delete individual templates afterward to customize.

---

## Managing Templates

From **Settings > Recurring Templates**:

- **Edit** (pencil icon) — change any template field; schedule changes recalculate the next due date
- **Delete** (trash icon) — permanently removes the template (existing generated tasks remain)
- **Pause/Resume** (toggle switch) — pausing stops new task generation; resuming generates a task immediately

---

## Tips

- **Start small** — load a pack and pause templates you don't need yet. Activate them as you build the habit
- **Use colors consistently** — the SHE system uses color to indicate frequency at a glance
- **Check Card File daily** — make it part of your morning routine alongside Do Now
- **Skip freely** — skipping a card isn't failure, it's honest prioritization. The card comes back next cycle

---

## See Also

- [[what-is-gtd|What Is GTD?]] — the methodology behind Tandem
- [[organize|Organize]] — how tasks, projects, and areas fit together
- [[horizons-of-focus|Horizons of Focus]] — connecting routines to life goals
