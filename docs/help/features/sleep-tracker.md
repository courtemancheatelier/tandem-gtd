---
title: Sleep Tracker
category: Features
tags: [sleep, bedtime, wake, routine, drift, performance, card file, tracking]
sortOrder: 13
---

# Sleep Tracker

The Sleep Tracker is a special routine type that logs your bedtime and wake time each day, then correlates your sleep patterns with next-day task completion on the Drift Dashboard. It's designed to help you see how late nights affect your productivity.

---

## Setting Up a Sleep Tracker

1. Go to **Settings > Routines**
2. Click **New Routine**
3. Select the **Sleep Tracker** mode
4. Set your **target bedtime** (default: 11:00 PM) and **target wake time** (default: 7:00 AM)
5. Optionally link to an **Area** or **Goal**
6. Click **Save**

The sleep tracker is always daily — you don't need to set a schedule.

---

## Daily Logging

Your sleep card appears in the **Card File** each day and moves through three states:

### Evening — "Going to Bed"

The card shows your target bedtime and a **Going to Bed** button. When you're heading to sleep, tap the button. Your actual bedtime is recorded.

### Morning — "I'm Up"

After logging bedtime, the card shows when you went to bed, whether you were on time, and your target wake time. Tap **I'm Up** when you wake. Your sleep duration is calculated automatically.

When you log your wake time, the associated daily task **auto-completes** — you don't need to check it off separately.

### Complete — Summary

Once both times are logged, the card shows your bedtime, wake time, on-time status for each, and total sleep duration.

---

## Editing Sleep Times

Tap the **pencil icon** on the card (visible in any state) to manually enter or correct times. This is useful for:

- Backfilling a night you forgot to log
- Correcting a time if you tapped the button at the wrong moment
- Entering times for a previous day

Both bedtime and wake time use a standard time picker in HH:MM format. Save recalculates duration and on-time status automatically. If both times are now set, the daily task auto-completes.

---

## On-Time Logic

- **Bedtime** is considered on-time if you go to bed within 6 hours before your target. Going to bed after your target is late.
- **Wake time** is considered on-time if you wake at or before your target.

Times are compared in your local timezone (set in notification preferences).

---

## Sleep & Performance Dashboard

After logging a few nights, a **Sleep & Performance** section appears on the **Drift Dashboard** (under Insights > Commitment Drift).

### Stat Cards

| Stat | What It Shows |
|------|---------------|
| **Avg Sleep** | Average sleep duration across logged nights, with trend vs. prior period |
| **On-Time Bedtime** | Percentage of nights you hit your target bedtime |
| **Late Night Impact** | Difference in next-day task completion rate between on-time and late nights |

### Daily Chart

A combined chart showing:
- **Blue bars** — how many minutes early or late you went to bed relative to your target
- **Amber line** — your task completion rate the following day

This makes it easy to spot the pattern: do late nights actually affect your next-day output?

The chart appears once you have 2+ days of data and responds to the drift dashboard's time window selector (this week, last week, this month, year to date).

---

## Tips

- **Log from your phone.** The sleep card works great on mobile — tap Going to Bed from the Card File right before you put your phone down.
- **Don't stress about exact times.** The manual edit is always there. Rough accuracy is enough to see patterns.
- **Give it a week.** The Late Night Impact stat needs several nights of data (both on-time and late) to show meaningful comparisons.
- **Check the Drift Dashboard weekly.** The sleep-to-completion correlation is most useful as a trend, not a single data point.
