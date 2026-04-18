---
title: Card File & Recurring Cards
category: Features
tags: [card-file, recurring, routines, habits, SHE, packs, simple-routines]
sortOrder: 10
---

# Card File & Recurring Cards

The Card File is Tandem's system for managing recurring tasks — things you do daily, weekly, monthly, or seasonally. Inspired by the SHE (Sidetracked Home Executives) index card system, it turns routines into cards that cycle automatically: complete a card today, and it reappears on its next scheduled date.

---

## How It Works

1. **Create a routine** — define the task, schedule, and optional settings
2. **Load today's cards** — click the **Load Today's Cards** button at the top of the Card File page to generate any pending routine cards
3. **Complete (or skip) the card** — the routine recycles and generates the next occurrence
4. **Repeat forever** — until you pause or delete the routine

Routines are managed in **Settings > Routines**. The generated tasks appear in **Card File** (under GTD in the sidebar).

---

## Two Types of Routines

| Type | What It Is | Example |
|------|-----------|---------|
| **Simple** | A single recurring card with optional progression | "Vacuum all floors", "Run 3 miles" |
| **Windowed** | A multi-window checklist with per-item tracking | "Daily Supplements", "Morning Routine" |

Simple routines generate a single card you complete, skip, or defer. Windowed routines generate a card with timed windows containing items you check off individually. Both types are managed from the same **Settings > Routines** page.

---

## Loading Your Cards

When you open the Card File page, click **Load Today's Cards** in the top-right corner to generate any routine cards that are due. This is safe to click anytime — if all your cards are already loaded, it will tell you "All caught up."

Cards are generated based on each routine's schedule and next due date. Completing or skipping a card automatically recycles it to the next occurrence, so you typically only need the button when you first open the page each day.

---

## Card File View

Navigate to **Card File** in the GTD section of the sidebar. Cards are sorted into three groups:

| Section | Meaning |
|---------|---------|
| **Overdue** | Cards whose scheduled date has passed — handle these first |
| **Today's Cards** | Cards due today, sorted by target time |
| **Upcoming** | Cards scheduled for future dates — use the **Today** button to pull one into today's cards early |

Each card shows its title, schedule label, color stripe, and time estimate. For simple cards you can:

- **Complete** — marks the task done and generates the next occurrence
- **Skip** — drops this occurrence and generates the next one (limited to 2 consecutive skips)
- **Defer** — pushes the card to a later date you choose

---

## Creating Simple Routines

Go to **Settings > Routines** and click **New Routine**. Select **Simple Card** mode.

### Basic Fields

- **Title** — what appears on each generated card (e.g., "Vacuum all floors")
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

### Time-of-Day Scheduling

- **Target Time** — when you ideally do this task (e.g., 9:00 AM). Cards are sorted by target time in the Card File
- **Due By Time** — after this time, the card shows an overdue indicator

### Card Color & Time Estimate

- **Card Color** — the color stripe shown on the card. Use colors to group by frequency (e.g., yellow for daily, blue for weekly)
- **Time Estimate** — minutes per occurrence, shown on the card

### Progressive Difficulty

Simple routines support auto-increasing targets over time:

- **Base Value** — starting target (e.g., 5)
- **Increment** — amount to increase per period (e.g., 1)
- **Unit** — label for the value (e.g., "min", "laps", "reps")
- **Frequency** — how often to increase (daily, weekly, or monthly)

The current target appears as a badge on the card (e.g., "7 min (+1/week)").

### Skip Streaks

When you skip a card, tally marks appear on it (SHE pencil marks). After 2 consecutive skips, the skip button is disabled — you must complete or defer the card. Completing a card resets the streak.

### Horizons & Task Defaults

- **Area / Goal** — link the routine to a GTD area of responsibility or goal
- **Task Defaults** — project, context, and energy level applied to generated tasks

---

## Template Packs

Template packs are pre-built sets of simple routines you can load in one click.

### Available Packs

**Running a House** (22 routines)
A complete household maintenance system covering daily tidying, weekly cleaning, monthly deep cleans, and seasonal maintenance. Color-coded by frequency.

**Small Garden** (12 routines)
Daily watering through seasonal planning for a backyard or patio garden.

### Loading a Pack

1. Navigate to **Card File** or **Settings > Routines**
2. If you have no routines, pack cards appear automatically
3. Click **Load Pack** on the pack you want
4. All routines are created and daily tasks appear in your Card File immediately

You can load multiple packs — they combine. Edit or delete individual routines afterward to customize.

---

## Managing Routines

From **Settings > Routines**:

- **Edit** (pencil icon) — change any routine field; schedule changes recalculate the next due date
- **Delete** (trash icon) — permanently removes the routine (existing generated tasks remain)
- **Pause/Resume** (toggle switch) — pausing stops new task generation; resuming generates a task immediately

---

## Tips

- **Start small** — load a pack and pause routines you don't need yet
- **Use colors consistently** — the SHE system uses color to indicate frequency at a glance
- **Check Card File daily** — make it part of your morning alongside Do Now; hit **Load Today's Cards** to pull in anything due
- **Skip freely** — skipping a card isn't failure, it's honest prioritization

---

## See Also

- [[routines|Routines]] — windowed routines with multi-item checklists and compliance tracking
- [[what-is-gtd|What Is GTD?]] — the methodology behind Tandem
- [[organize|Organize]] — how tasks, projects, and areas fit together
- [[horizons-of-focus|Horizons of Focus]] — connecting routines to life goals
