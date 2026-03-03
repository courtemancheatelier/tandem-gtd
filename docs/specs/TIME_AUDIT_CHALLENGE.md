# Time Audit Challenge — Feature Spec

**Date:** March 1, 2026
**Author:** Jason Courtemanche / Courtemanche Atelier
**Status:** Draft
**Context:** A one-week awareness tool that helps users see how they actually spend their time vs. what their GTD system thinks they're doing.

---

## 1. Concept

The Time Audit Challenge is a standalone one-week exercise where the user logs what they actually did every 15 minutes. The goal is **awareness, not tracking** — by creating a mirror of real behavior for a full week, users gain insight into the gap between their GTD system and their lived reality.

This is inspired by [Alex Hormozi's 15-minute time tracking method](https://podcasts.apple.com/de/podcast/the-man-that-makes-millionaires-turn-%24100-to-%2410k/id1291423644?i=1000691729705) — the practice of writing down what you did every 15 minutes for one full week. The insight comes not from the individual entries, but from the aggregate picture: where did my time *actually* go?

### What This Is NOT

- **Not a time tracker.** There is no ongoing tracking, no timers, no Toggl-style punch clock.
- **Not task duration tracking.** Logging actual time against completed tasks is a separate feature and intentionally decoupled from this spec.
- **Not a GTD feature.** This is an awareness tool that *serves* GTD by surfacing blind spots. It doesn't replace any part of the methodology.

---

## 2. User Flow

### 2.1 Starting a Challenge

The user explicitly opts in to a Time Audit day. Entry points:

- **Dashboard card:** "Try a Time Audit Challenge" — shown occasionally (see §5 for suggestion logic)
- **Settings/Tools page:** Always available under a "Self-Awareness Tools" or "Challenges" section
- **Weekly Review suggestion:** The review coach can suggest it periodically (see §5)

When starting, the user sets:

- **Start time:** Defaults to now, rounded to next 15-minute mark
- **End time:** Defaults to 16 hours from start (a full waking day), adjustable
- **Reminder method:** Push notification, in-app nudge, or both

```
┌─────────────────────────────────────────────────┐
│  🕐 Time Audit Challenge                        │
│                                                 │
│  For one week, log what you did every 15 minutes.│
│  No judgment — just awareness.                  │
│                                                 │
│  Start:  [7:00 AM ▾]                            │
│  End:    [11:00 PM ▾]                           │
│  Remind: [Push notification ▾]                  │
│                                                 │
│  [ Start Challenge ]                            │
└─────────────────────────────────────────────────┘
```

### 2.2 Logging an Entry (Every 15 Minutes)

When the interval fires, the user gets a gentle nudge. The logging UI is designed for **minimal friction** — this needs to take under 30 seconds or people will abandon it by hour two.

**Notification:** "What did you do for the last 15 minutes?"

**Logging UI (tap the notification or open app):**

```
┌─────────────────────────────────────────────────┐
│  ⏱ 10:15 AM – 10:30 AM                         │
│                                                 │
│  What did you do?                               │
│  ┌─────────────────────────────────────────────┐│
│  │ [freeform text input]                       ││
│  └─────────────────────────────────────────────┘│
│                                                 │
│  Quick tags:                                    │
│  [🎯 Task work] [📧 Email/messages] [🤝 Meeting]│
│  [📱 Phone/scroll] [🍽 Eating] [🚶 Transit]     │
│  [💤 Rest/break] [🧠 Thinking] [💬 Conversation]│
│  [🎭 Entertainment] [🏋 Exercise] [🏠 Chores]   │
│                                                 │
│  Link to task: [Search tasks...] (optional)     │
│                                                 │
│  [ Log It ]                                     │
└─────────────────────────────────────────────────┘
```

**Key design decisions:**

- **Quick tags are the primary input.** Tap a tag, optionally add a note, done. The freeform text is secondary.
- **Linking to a task is optional.** This is where the GTD connection happens — entries linked to real tasks can later be compared against the system. But forcing it would slow things down.
- **Multiple tags allowed.** "I was on a call while eating lunch" = 🤝 + 🍽
- **Missed intervals accumulate.** If the user misses one, the next prompt covers the gap: "10:15 AM – 10:45 AM (2 intervals)" — they can split or log as one block.
- **Batch catchup.** If the user misses several intervals, show a simplified timeline view where they can quickly fill in blocks rather than one-at-a-time.

### 2.3 During the Day — Passive Awareness

While a challenge is active:

- A subtle indicator in the app header shows the challenge is running (small clock icon or progress bar)
- The notification cadence is consistent — every 15 minutes, no exceptions, no "smart" delays
- The user can pause the challenge (e.g., during a nap) and resume
- If the app is open, show a gentle in-app toast rather than a system notification

### 2.4 Ending the Challenge

The challenge ends automatically at the configured end time, or the user can end it early. Partial days still generate insights — you don't need 100% completion.

Minimum viable data: at least 8 logged intervals (~2 hours) to generate the summary.

---

## 3. The Summary — Where the Insight Lives

After the challenge ends (or the next morning), the user gets a summary view. This is the payoff. The design goal is **"huh, that's interesting"** not **"you failed at productivity."**

### 3.1 Time Distribution

A pie/donut chart showing time by quick-tag category:

```
┌─────────────────────────────────────────────────┐
│  📊 Your Day — March 1, 2026                    │
│  Logged: 12h 45min (51 of 64 intervals)         │
│                                                 │
│      ┌──────────────┐                           │
│      │  🎯 28%      │   Task work      3h 30m  │
│      │  📧 18%      │   Email/messages  2h 15m  │
│      │  📱 14%      │   Phone/scroll   1h 45m  │
│      │  🤝 12%      │   Meetings       1h 30m  │
│      │  🍽  8%      │   Eating         1h 00m  │
│      │  🏠  8%      │   Chores         1h 00m  │
│      │  💬  6%      │   Conversation   0h 45m  │
│      │  💤  6%      │   Rest/break     0h 45m  │
│      └──────────────┘                           │
└─────────────────────────────────────────────────┘
```

### 3.2 System Alignment Score

This is the unique Tandem insight. Compare time spent on task-linked entries against total logged time:

```
┌─────────────────────────────────────────────────┐
│  🎯 GTD Alignment                                │
│                                                 │
│  ████████░░░░░░░░░░░░  35% of your time was     │
│                        linked to tasks in Tandem │
│                                                 │
│  This means 65% of your day was spent on things │
│  not currently in your system. That's not bad — │
│  eating, transit, and breaks are part of life.   │
│                                                 │
│  But if you subtract life maintenance (eating,  │
│  rest, transit, chores):                        │
│                                                 │
│  ████████████░░░░░░░░  56% of "work" time was   │
│                        in your GTD system        │
│                                                 │
│  The gap might include:                         │
│  • Reactive work (email, messages) not captured  │
│  • Tasks you did but hadn't captured yet         │
│  • Time lost to context-switching or scrolling   │
└─────────────────────────────────────────────────┘
```

### 3.3 Time-of-Day Energy Map

A horizontal heatmap showing tag distribution across the day — reveals natural energy patterns:

```
┌─────────────────────────────────────────────────┐
│  ⚡ Energy Pattern                               │
│                                                 │
│  7AM  ░░▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░  11PM  │
│       🏠🎯🎯🎯🎯📧📧🍽📱🤝🤝🎯🎯📧📱💬🍽💤🎭🎭│
│                                                 │
│  Your most focused task work happened between   │
│  8-11 AM. After lunch you shifted to reactive   │
│  work. Evening was mostly unwinding.            │
└─────────────────────────────────────────────────┘
```

### 3.4 Observations (Not Judgments)

The summary ends with neutral, curiosity-framed observations — never prescriptive:

- "You spent more time on email/messages than on any single project."
- "Your longest uninterrupted focus block was 45 minutes (9:00–9:45 AM)."
- "You had 1h 45m of phone/scrolling spread across 7 separate intervals — mostly between tasks."
- "3 intervals were logged as 'thinking' with no task link — these might be planning time worth capturing."

### 3.5 Optional: Capture Actions

After reviewing the summary, prompt the user to capture anything that surfaced:

- "Want to add any of these untracked activities to your inbox?"
- Show a list of freeform entries not linked to tasks, with one-tap "Send to Inbox" buttons

---

## 4. Data Model

### 4.1 New Models

```prisma
model TimeAuditChallenge {
  id          String    @id @default(cuid())
  userId      String
  user        User      @relation(fields: [userId], references: [id])
  startTime   DateTime
  endTime     DateTime
  status      TimeAuditStatus @default(ACTIVE)
  pausedAt    DateTime?           // If currently paused
  totalPaused Int       @default(0) // Cumulative paused minutes
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  entries     TimeAuditEntry[]
  summary     Json?               // Cached summary data after completion

  @@index([userId, status])
  @@index([userId, createdAt])
}

enum TimeAuditStatus {
  ACTIVE
  PAUSED
  COMPLETED
  ABANDONED
}

model TimeAuditEntry {
  id           String   @id @default(cuid())
  challengeId  String
  challenge    TimeAuditChallenge @relation(fields: [challengeId], references: [id], onDelete: Cascade)
  intervalStart DateTime
  intervalEnd   DateTime
  tags         String[]           // Array of quick-tag keys
  note         String?            // Optional freeform text
  taskId       String?            // Optional link to a real task
  task         Task?    @relation(fields: [taskId], references: [id], onDelete: SetNull)
  createdAt    DateTime @default(now())

  @@index([challengeId, intervalStart])
}
```

### 4.2 Quick-Tag Registry

Quick tags are stored as a system-level configuration with user customization:

```typescript
// Default quick tags — users can add/remove/reorder
const DEFAULT_QUICK_TAGS = [
  { key: "task_work",      emoji: "🎯", label: "Task work",      category: "productive" },
  { key: "email_messages",  emoji: "📧", label: "Email/messages", category: "reactive" },
  { key: "meeting",         emoji: "🤝", label: "Meeting",        category: "productive" },
  { key: "phone_scroll",    emoji: "📱", label: "Phone/scroll",   category: "untracked" },
  { key: "eating",          emoji: "🍽", label: "Eating",          category: "maintenance" },
  { key: "transit",         emoji: "🚶", label: "Transit",        category: "maintenance" },
  { key: "rest_break",      emoji: "💤", label: "Rest/break",     category: "maintenance" },
  { key: "thinking",        emoji: "🧠", label: "Thinking",       category: "productive" },
  { key: "conversation",    emoji: "💬", label: "Conversation",   category: "productive" },
  { key: "entertainment",   emoji: "🎭", label: "Entertainment",  category: "untracked" },
  { key: "exercise",        emoji: "🏋", label: "Exercise",       category: "maintenance" },
  { key: "chores",          emoji: "🏠", label: "Chores",         category: "maintenance" },
] as const;

// Categories drive the alignment score calculation:
// "productive" + "reactive" = work time
// "maintenance" = life time (subtracted from alignment denominator)
// "untracked" = the interesting gap
```

---

## 5. Suggestion Logic — When to Prompt a Challenge

The system should gently suggest a time audit periodically, not nag. Rules:

- **Never suggest during an active challenge.** Obviously.
- **First suggestion:** After the user has been active for 2+ weeks and completed at least one weekly review. They need enough GTD data for the alignment score to be meaningful.
- **Recurring suggestion:** No more than once every 90 days. Surface as a card on the dashboard or as a suggestion during the Weekly Review's "Get Creative" step.
- **Smart triggers (future):** If the weekly review shows a pattern of stale projects + high inbox volume, this might indicate a system-reality gap worth auditing.

---

## 6. Notification Strategy

### 6.1 Interval Reminders

The 15-minute nudge is the heartbeat of the challenge. It must be:

- **Consistent.** Every 15 minutes on the mark, no "smart" batching or delay.
- **Gentle.** A quiet notification, not an alarm. The sound/vibration should be distinct from other app notifications so the user builds an association.
- **Dismissible without guilt.** Missing an interval is fine — the batch catchup UI handles gaps.

### 6.2 Implementation

- **PWA push notifications** for web users (requires service worker + push subscription)
- **Native push** for mobile (via the same notification infrastructure used for due date reminders)
- **In-app toast** when the app is in the foreground
- **Fallback:** If push permissions aren't granted, the challenge still works — the user just has to remember to open the app. Show a prominent banner at the top of every page during an active challenge.

---

## 7. Privacy & Data Retention

- Time audit data is **personal only** — never visible to team members, never included in team dashboards.
- Challenge entries are stored indefinitely by default but the user can delete any challenge and its entries.
- Summary data (the cached JSON) is preserved even if individual entries are deleted, so historical trend comparisons remain possible.
- AI features (embedded assistant, MCP) **cannot read** time audit entries unless the user explicitly shares their summary. This data is too intimate for ambient AI access.

---

## 8. API Endpoints

```
POST   /api/time-audit                  Create a new challenge
GET    /api/time-audit/active           Get active challenge (if any)
PATCH  /api/time-audit/:id              Update challenge (pause/resume/end)
DELETE /api/time-audit/:id              Delete challenge + entries

POST   /api/time-audit/:id/entries      Log an entry (or batch of entries)
GET    /api/time-audit/:id/entries      List entries for a challenge
PATCH  /api/time-audit/:id/entries/:eid Update an entry
DELETE /api/time-audit/:id/entries/:eid Delete an entry

GET    /api/time-audit/:id/summary      Generate/retrieve summary
GET    /api/time-audit/history          List past challenges with basic stats
```

---

## 9. MCP Integration

Add a lightweight MCP surface for the time audit:

```typescript
// Tools
time_audit_start(startTime?, endTime?)    // Start a challenge
time_audit_log(tags[], note?, taskId?)     // Log current interval
time_audit_status()                        // Check if challenge is active, show stats so far
time_audit_summary(challengeId?)           // Get summary of most recent or specified challenge
```

This allows users to log entries conversationally in Claude: "I just spent 15 minutes scrolling Twitter" → Claude calls `time_audit_log` with `["phone_scroll"]`.

---

## 10. UI Locations

| Location | What's Shown |
|----------|-------------|
| **Dashboard** | Suggestion card (when due), active challenge mini-status |
| **Dedicated page** (`/time-audit`) | Full challenge view — start, log, review summaries |
| **Weekly Review** | Suggestion during "Get Creative" step; past summary reference |
| **Settings > Challenges** | Challenge history, quick-tag customization, notification preferences |
| **Notification/toast** | 15-minute interval prompts during active challenge |

---

## 11. Future Considerations (Out of Scope for v1)

- **AI-powered observations:** Let the embedded assistant analyze the summary and offer personalized reflections. Gated behind explicit user opt-in.
- **Trend comparison:** "Your March audit vs. your January audit" — show changes over time.
- **Context-time correlation:** Cross-reference audit data with GTD contexts to suggest better context assignments.
- **Pomodoro hybrid:** Option to use 25-minute intervals instead of 15 for users who prefer Pomodoro-style blocks.
- **Team challenges:** Opt-in team-wide audit days where everyone does it together (aggregated, anonymized data only).
- **Integration with task duration tracking:** Once the separate "actual vs. estimated time" feature exists, the audit could auto-populate from completed tasks during challenge hours.

---

*This spec is a living document. Bring it to Claude Code sessions for Tandem implementation.*
