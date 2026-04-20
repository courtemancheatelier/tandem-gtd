# Recurring Task Card File (SHE-Inspired Recycling)

> **Status:** Draft
> **Last updated:** 2026-02-23

---

## 1. Problem Statement / Motivation

### The SHE System

The **Sidetracked Home Executives (SHE)** system by Pam Young & Peggy Jones uses a physical 3x5 card file box with day dividers (1-31) and month dividers (Jan-Dec). Every recurring task gets a color-coded card:

- **Yellow** — Daily tasks
- **Blue** — Weekly tasks
- **White** — Monthly tasks
- **Pink** — Personal / seasonal tasks

Each morning you pull today's cards, do the tasks, and **refile each card behind its next due date**. Nothing gets forgotten because cards always rotate back through the file.

### Why SHE + GTD Is a Natural Fit

GTD's tickler file (43 folders: 31 days + 12 months) is the same idea. Tandem already has:

- `RecurringTemplate` model with schedule parsing (`daily`, `weekdays`, `weekly`, `biweekly`, `monthly`)
- `generateTaskFromTemplate()` and `processRecurringTemplates()` in `src/lib/recurring.ts`
- A management UI at `/settings/recurring/` (`RecurringTemplateList`, `RecurringTemplateForm`, `SchedulePicker`)
- A tickler system (`scheduledDate` + `src/lib/tickler.ts`) for deferring tasks until a future date

### The Gap

Tasks generated from templates are **fire-and-forget** — there is no round-trip:

1. **No link from Task back to RecurringTemplate** — when you complete a task, there's no way to know it came from a template
2. **No completion-triggered recycling** — the "card goes back in the file" behavior doesn't exist
3. **No background scheduler** — generation requires a manual `POST /api/recurring-templates/generate` call
4. **Limited frequencies** — no quarterly, seasonal, yearly, or custom-interval schedules
5. **No "Card File" view** — no SHE-inspired UI showing tasks organized by frequency with "today's cards"

---

## 2. Data Model Changes

### 2.1 Task → RecurringTemplate Link

Add a nullable FK on `Task` pointing back to the template that generated it:

```prisma
// In model Task (schema.prisma ~line 412)
recurringTemplateId String?
recurringTemplate   RecurringTemplate? @relation(fields: [recurringTemplateId], references: [id], onDelete: SetNull)
```

Add the reverse relation on `RecurringTemplate`:

```prisma
// In model RecurringTemplate (schema.prisma ~line 556)
tasks Task[]
```

Add an index for efficient lookups:

```prisma
@@index([recurringTemplateId])
```

This enables:
- Querying "which template generated this task?"
- Querying "is there already an active task for this template?" (idempotency guard)
- Showing completion history per template

### 2.2 New Fields on RecurringTemplate

```prisma
model RecurringTemplate {
  // ... existing fields ...

  color         String?   // SHE-style card color (hex). Null = auto-assign by frequency
  estimatedMins Int?      // Promoted from taskDefaults.estimatedMins for direct access
}
```

**`color`** — Optional hex color for the card. If null, the Card File view auto-assigns by frequency using SHE defaults (yellow/blue/white/pink). Users can override per-template.

**`estimatedMins`** — Currently buried inside `taskDefaults` JSON. Promoting it to a first-class column enables sorting/filtering by time and avoids JSON extraction in queries. The `taskDefaults.estimatedMins` path continues to work as a fallback; `generateTaskFromTemplate()` prefers the column value.

### 2.3 Extended Schedule Frequencies

Add new types to `ParsedSchedule`:

```typescript
export interface ParsedSchedule {
  type: "daily" | "weekdays" | "weekly" | "biweekly" | "monthly"
      | "quarterly" | "yearly" | "every_n_days";
  dayOfWeek?: number;     // 0-6 for weekly/biweekly
  dayOfMonth?: number;    // 1-31 for monthly, quarterly, yearly
  month?: number;         // 1-12 for yearly
  quarter?: number;       // 1-4 for quarterly
  intervalDays?: number;  // N for every_n_days
}
```

New schedule expression formats:

| Expression | Meaning | Example |
|---|---|---|
| `quarterly:1` | Quarterly on the 1st (Q1=Jan, Q2=Apr, Q3=Jul, Q4=Oct) | `quarterly:15` = 15th of each quarter-start month |
| `yearly:3:15` | Every year on March 15 | `yearly:12:25` = Dec 25 |
| `every_n_days:N` | Every N days from last completion | `every_n_days:14` = every 14 days |

**Seasonal** schedules map to quarterly with human-friendly labels:
- `quarterly:1` with display "Spring / Summer / Fall / Winter" based on which quarter is next

---

## 3. Completion-Triggered Recycling (The Engine Change)

This is the core SHE behavior: **when you complete a card, it goes back in the file behind its next due date.**

### 3.1 Hook Point

In `src/lib/services/task-service.ts`, `completeTask()` (line 169-256). After the cascade runs and promoted/completed events are written (~line 253), add the recycling step:

```typescript
// After cascade events are written, before return
// --- Recurring Task Recycling ---
if (task.recurringTemplateId) {
  const recycled = await recycleRecurringTask(task.recurringTemplateId, userId);
  if (recycled) {
    cascadeResult.recycledTasks = [recycled];
  }
}

return { task, cascade: cascadeResult };
```

### 3.2 Recycling Function

New function in `src/lib/recurring.ts`:

```typescript
export async function recycleRecurringTask(
  templateId: string,
  userId: string
): Promise<{ id: string; title: string; nextDue: Date } | null> {
  const template = await prisma.recurringTemplate.findFirst({
    where: { id: templateId, userId, isActive: true },
  });
  if (!template) return null;

  const now = new Date();
  const nextDue = getNextOccurrence(template.cronExpression, now);

  // Create the next task occurrence
  const newTask = await generateTaskFromTemplate({
    ...template,
    taskDefaults: template.taskDefaults as TaskDefaults | null,
    nextDue,  // Set scheduledDate to next due (tickler behavior)
  });

  // Update template tracking
  await prisma.recurringTemplate.update({
    where: { id: templateId },
    data: {
      lastGenerated: now,
      nextDue,
    },
  });

  return { id: newTask.id, title: newTask.title, nextDue };
}
```

### 3.3 Update generateTaskFromTemplate

Modify `generateTaskFromTemplate()` to:
1. Set `recurringTemplateId` on the created task
2. Use `scheduledDate` (tickler) instead of `dueDate` for the next occurrence — hides the task until it's due
3. Return the created task (currently returns `void`)

```typescript
export async function generateTaskFromTemplate(
  template: RecurringTemplateRecord
): Promise<Task> {
  const defaults = (template.taskDefaults ?? {}) as TaskDefaults;

  const task = await prisma.task.create({
    data: {
      title: template.title,
      notes: template.description || null,
      userId: template.userId,
      projectId: defaults.projectId || null,
      contextId: defaults.contextId || null,
      energyLevel: defaults.energyLevel || null,
      estimatedMins: template.estimatedMins ?? defaults.estimatedMins ?? null,
      status: "NOT_STARTED",
      scheduledDate: template.nextDue || null,   // Tickler: hidden until due
      recurringTemplateId: template.id,           // NEW: back-link
    },
  });

  return task;
}
```

### 3.4 Update CascadeResult

In `src/lib/cascade.ts` (line 4-10), extend the result type:

```typescript
export interface CascadeResult {
  promotedTasks: Array<{ id: string; title: string }>;
  completedProjects: Array<{ id: string; title: string }>;
  updatedGoals: Array<{ id: string; title: string; progress: number }>;
  completedMilestones: Array<{ id: string; title: string }>;
  updatedRollups: Array<{ id: string; title: string; progress: number }>;
  recycledTasks: Array<{ id: string; title: string; nextDue: Date }>;  // NEW
}
```

Initialize `recycledTasks: []` in `onTaskComplete()`.

### 3.5 UI Feedback

When `cascade.recycledTasks` is non-empty, the completing UI shows a toast:

> Scheduled "Clean fridge" for next Monday

The toast links to the newly created task for quick editing (change date, add notes, etc.).

---

## 4. Background Scheduler

### 4.1 Cron Endpoint

New API route: `POST /api/cron/recurring`

```typescript
// src/app/api/cron/recurring/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateTaskFromTemplate, getNextOccurrence } from "@/lib/recurring";

const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(req: NextRequest) {
  // Authenticate: require secret header for external cron callers
  const authHeader = req.headers.get("authorization");
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // Find all overdue templates across all users
  const templates = await prisma.recurringTemplate.findMany({
    where: {
      isActive: true,
      nextDue: { lte: now },
    },
  });

  let generated = 0;
  let skipped = 0;

  for (const template of templates) {
    // Idempotency: skip if an active task already exists for this template
    const existingActive = await prisma.task.findFirst({
      where: {
        recurringTemplateId: template.id,
        status: { notIn: ["COMPLETED", "DROPPED"] },
      },
    });

    if (existingActive) {
      skipped++;
      continue;
    }

    await generateTaskFromTemplate(template);

    const nextDue = getNextOccurrence(template.cronExpression, now);
    await prisma.recurringTemplate.update({
      where: { id: template.id },
      data: { lastGenerated: now, nextDue },
    });

    generated++;
  }

  return NextResponse.json({ generated, skipped, total: templates.length });
}
```

### 4.2 Triggering Options

| Method | Setup | Frequency |
|---|---|---|
| **Vercel Cron** | Add to `vercel.json`: `{ "crons": [{ "path": "/api/cron/recurring", "schedule": "0 6 * * *" }] }` | Daily at 6 AM UTC |
| **External cron** (systemd timer, GitHub Action) | `curl -X POST -H "Authorization: Bearer $SECRET" https://app.tandem.dev/api/cron/recurring` | Configurable |
| **On page load** (fallback) | Check in middleware or layout: if user's last cron > 6h ago, fire the endpoint | Opportunistic |

### 4.3 Idempotency Guarantees

- Before generating, check: does an active (non-completed, non-dropped) task with this `recurringTemplateId` already exist?
- If yes, skip generation — the user hasn't finished the previous occurrence yet
- This prevents duplicates from cron running multiple times or from both cron and completion-recycling firing

---

## 5. Extended Frequencies

### 5.1 Parser Updates (`src/lib/recurring.ts`)

Add cases to `parseSchedule()`:

```typescript
// quarterly:N  — Nth day of each quarter-start month (Jan, Apr, Jul, Oct)
if (cronExpression.startsWith("quarterly:")) {
  const dayOfMonth = parseInt(cronExpression.split(":")[1], 10);
  if (isNaN(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
    throw new Error(`Invalid quarterly day: ${cronExpression}`);
  }
  return { type: "quarterly", dayOfMonth };
}

// yearly:M:D  — Every year on month M, day D
if (cronExpression.startsWith("yearly:")) {
  const parts = cronExpression.split(":");
  const month = parseInt(parts[1], 10);
  const dayOfMonth = parseInt(parts[2], 10);
  if (isNaN(month) || month < 1 || month > 12) {
    throw new Error(`Invalid yearly month: ${cronExpression}`);
  }
  if (isNaN(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
    throw new Error(`Invalid yearly day: ${cronExpression}`);
  }
  return { type: "yearly", month, dayOfMonth };
}

// every_n_days:N  — Every N days from last completion
if (cronExpression.startsWith("every_n_days:")) {
  const intervalDays = parseInt(cronExpression.split(":")[1], 10);
  if (isNaN(intervalDays) || intervalDays < 1 || intervalDays > 365) {
    throw new Error(`Invalid interval: ${cronExpression}`);
  }
  return { type: "every_n_days", intervalDays };
}
```

### 5.2 Next Occurrence Calculation

Add cases to `getNextOccurrence()`:

```typescript
case "quarterly": {
  const targetDay = schedule.dayOfMonth!;
  const quarterMonths = [0, 3, 6, 9]; // Jan, Apr, Jul, Oct (0-indexed)
  // Find the next quarter-start month where targetDay hasn't passed
  let candidate = new Date(next);
  for (let i = 0; i < 8; i++) { // Check up to 2 years of quarters
    const qMonth = quarterMonths[i % 4];
    const qYear = next.getUTCFullYear() + Math.floor(i / 4);
    candidate = new Date(Date.UTC(qYear, qMonth, 1));
    const daysInMonth = getDaysInMonth(qYear, qMonth);
    candidate.setUTCDate(Math.min(targetDay, daysInMonth));
    if (candidate > start) return candidate;
  }
  throw new Error("Could not compute next quarterly occurrence");
}

case "yearly": {
  const targetMonth = schedule.month! - 1; // 0-indexed
  const targetDay = schedule.dayOfMonth!;
  let year = next.getUTCFullYear();
  let candidate = new Date(Date.UTC(year, targetMonth, 1));
  const daysInMonth = getDaysInMonth(year, targetMonth);
  candidate.setUTCDate(Math.min(targetDay, daysInMonth));
  if (candidate <= start) {
    year++;
    const dim = getDaysInMonth(year, targetMonth);
    candidate = new Date(Date.UTC(year, targetMonth, Math.min(targetDay, dim)));
  }
  return candidate;
}

case "every_n_days": {
  const intervalDays = schedule.intervalDays!;
  const result = new Date(start);
  result.setUTCDate(result.getUTCDate() + intervalDays);
  result.setUTCHours(0, 0, 0, 0);
  return result;
}
```

### 5.3 Human-Readable Labels

Add to `scheduleLabel()`:

```typescript
case "quarterly":
  return `Quarterly on the ${ordinal(schedule.dayOfMonth!)}`;
case "yearly":
  return `Yearly on ${MONTH_NAMES[schedule.month! - 1]} ${ordinal(schedule.dayOfMonth!)}`;
case "every_n_days":
  return `Every ${schedule.intervalDays} days`;
```

### 5.4 Validation Regex Update (`src/lib/validations/recurring.ts`)

Update the pattern to accept the new formats:

```typescript
const schedulePattern =
  /^(daily|weekdays|weekly:[0-6]|biweekly:[0-6]|monthly:([1-9]|[12]\d|3[01])|quarterly:([1-9]|[12]\d|3[01])|yearly:(0?[1-9]|1[0-2]):([1-9]|[12]\d|3[01])|every_n_days:([1-9]\d{0,2}))$/;
```

### 5.5 SchedulePicker.tsx Updates

Add new options to the frequency `<Select>`:

```tsx
<SelectItem value="quarterly">Quarterly</SelectItem>
<SelectItem value="yearly">Yearly</SelectItem>
<SelectItem value="every_n_days">Every N Days</SelectItem>
```

For `quarterly`: show day-of-month picker (same as monthly).
For `yearly`: show month picker + day-of-month picker.
For `every_n_days`: show a number input for interval days.

---

## 6. Card File View (SHE-Inspired UI)

### 6.1 Route

**`/do-now/card-file`** — accessible from the Do Now section as an alternative view.

### 6.2 Layout

```
┌─────────────────────────────────────────────────┐
│  Card File                          [+ New Card] │
├─────────────────────────────────────────────────┤
│  ⚠ OVERDUE (3)                                  │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│  │ yellow  │ │  blue   │ │  blue   │           │
│  │ Vacuum  │ │ Laundry │ │ Meal    │           │
│  │ @Home   │ │ @Home   │ │ Plan    │           │
│  │ 15 min  │ │ 30 min  │ │ 20 min  │           │
│  │ Due: Feb│ │ Due: Feb│ │ Due: Feb│           │
│  │   20    │ │   18    │ │   17    │           │
│  │ [✓] [→] │ │ [✓] [→] │ │ [✓] [→] │           │
│  └─────────┘ └─────────┘ └─────────┘           │
├─────────────────────────────────────────────────┤
│  TODAY'S CARDS (5)                              │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐  ...     │
│  │ yellow  │ │ yellow  │ │  blue   │           │
│  │ Make    │ │ Wipe    │ │ Clean   │           │
│  │ Bed     │ │ Counter │ │ Fridge  │           │
│  │ @Home   │ │ @Home   │ │ @Home   │           │
│  │ 2 min   │ │ 5 min   │ │ 20 min  │           │
│  │ Daily   │ │ Daily   │ │ Weekly  │           │
│  │ [✓] [→] │ │ [✓] [→] │ │ [✓] [→] │           │
│  └─────────┘ └─────────┘ └─────────┘           │
├─────────────────────────────────────────────────┤
│  UPCOMING                                       │
│  [Daily] [Weekly] [Monthly] [Quarterly+]  tabs  │
│  (shows cards filed for future dates)           │
└─────────────────────────────────────────────────┘
```

### 6.3 Card Component

Each card displays:

| Element | Source |
|---|---|
| **Color strip** (left border or top bar) | `RecurringTemplate.color` or auto by frequency |
| **Title** | Task title |
| **Context badge** | `@Home`, `@Office`, etc. from task's context |
| **Estimated time** | `estimatedMins` from template or task |
| **Frequency label** | `scheduleLabel(cronExpression)` — "Daily", "Every Monday", etc. |
| **Last completed** | Most recent completed task with same `recurringTemplateId` |
| **Complete button** | Triggers `completeTask()` → recycling → card animates "filing away" |
| **Defer button** | Reschedules to tomorrow (`scheduledDate = tomorrow`) or next week |

### 6.4 Default SHE Colors

| Frequency | Default Color | Hex |
|---|---|---|
| Daily | Yellow | `#FBBF24` |
| Weekdays | Yellow | `#FBBF24` |
| Weekly | Blue | `#60A5FA` |
| Biweekly | Blue | `#60A5FA` |
| Monthly | White/Gray | `#E5E7EB` |
| Quarterly | Pink | `#F9A8D4` |
| Yearly | Pink | `#F9A8D4` |
| Every N Days | Green | `#34D399` |

Users can override per-template via the `color` field.

### 6.5 Interactions

**Complete** — calls `PATCH /api/tasks/:id` with `{ status: "COMPLETED" }`. The recycling engine fires automatically, creating the next occurrence with `scheduledDate` set to the next due date. The card animates out (slide-right + fade). A toast shows the next scheduled date.

**Defer** — shows a popover with quick options:
- Tomorrow
- Next week (same weekday, next week)
- Pick a date (date picker)

Updates the task's `scheduledDate`. The card slides out of "Today's Cards" into the upcoming section.

**Skip** — marks the task as dropped (not completed — doesn't trigger recycling), then manually calls `recycleRecurringTask()` to generate the next occurrence. Use case: "I'm skipping this week's fridge cleaning but want it to come back next week."

### 6.6 Data Query

The Card File view queries:

```typescript
// Today's cards: tasks from recurring templates, due today or earlier
const todayCards = await prisma.task.findMany({
  where: {
    userId,
    recurringTemplateId: { not: null },
    status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
    OR: [
      { scheduledDate: null },
      { scheduledDate: { lte: endOfToday } },
    ],
  },
  include: {
    recurringTemplate: true,
    context: { select: { id: true, name: true, color: true } },
  },
  orderBy: { scheduledDate: "asc" },
});

// Upcoming cards: grouped by frequency
const upcomingCards = await prisma.task.findMany({
  where: {
    userId,
    recurringTemplateId: { not: null },
    status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
    scheduledDate: { gt: endOfToday },
  },
  include: {
    recurringTemplate: true,
    context: { select: { id: true, name: true, color: true } },
  },
  orderBy: { scheduledDate: "asc" },
});
```

---

## 7. Implementation Phases

### Phase 1: Task <-> Template Link + Recycling Engine

**Goal:** The core "card comes back" behavior.

**Schema changes:**
- Add `recurringTemplateId` (nullable FK) to `Task` model
- Add `tasks` relation on `RecurringTemplate`
- Add index on `recurringTemplateId`
- Migration: `npx prisma migrate dev --name add-recurring-template-link`

**Code changes:**
- `src/lib/recurring.ts`:
  - Update `generateTaskFromTemplate()` to set `recurringTemplateId` and `scheduledDate`, return the created `Task`
  - Add `recycleRecurringTask()` function
- `src/lib/cascade.ts`:
  - Add `recycledTasks` to `CascadeResult` interface
  - Initialize `recycledTasks: []` in `onTaskComplete()`
- `src/lib/services/task-service.ts`:
  - In `completeTask()`, after cascade events (~line 253): check `task.recurringTemplateId`, call `recycleRecurringTask()`, populate `cascadeResult.recycledTasks`
  - Update task include to fetch `recurringTemplateId`
- `src/lib/validations/task.ts`:
  - Add optional `recurringTemplateId` to create schema
- UI toast in task completion handler: show recycled task info

**Files touched:**
- `prisma/schema.prisma`
- `src/lib/recurring.ts`
- `src/lib/cascade.ts`
- `src/lib/services/task-service.ts`
- `src/lib/validations/task.ts`
- Task completion UI component (toast)

### Phase 2: Background Scheduler

**Goal:** Tasks generate automatically without user action.

**Code changes:**
- Create `src/app/api/cron/recurring/route.ts`
  - Bearer token auth via `CRON_SECRET` env var
  - Query all overdue templates across all users
  - Idempotency: skip if active task exists for template
  - Generate tasks, advance `nextDue`
- Add `CRON_SECRET` to `.env.example`
- Document Vercel Cron or external cron setup in comments

**Files touched:**
- `src/app/api/cron/recurring/route.ts` (new)
- `.env.example`
- `vercel.json` (if using Vercel Cron)

### Phase 3: Extended Frequencies

**Goal:** Support quarterly, yearly, and custom-interval schedules.

**Code changes:**
- `src/lib/recurring.ts`:
  - Extend `ParsedSchedule` type
  - Add `quarterly`, `yearly`, `every_n_days` cases to `parseSchedule()`
  - Add corresponding cases to `getNextOccurrence()`
  - Add labels to `scheduleLabel()`
- `src/lib/validations/recurring.ts`:
  - Update `schedulePattern` regex
  - Update error message text
- `src/components/recurring/SchedulePicker.tsx`:
  - Add frequency options: Quarterly, Yearly, Every N Days
  - Add month picker for yearly
  - Add number input for every_n_days

**Files touched:**
- `src/lib/recurring.ts`
- `src/lib/validations/recurring.ts`
- `src/components/recurring/SchedulePicker.tsx`

### Phase 4: Card File View

**Goal:** SHE-inspired visual interface for recurring tasks.

**New files:**
- `src/app/(dashboard)/do-now/card-file/page.tsx` — Page component
- `src/components/recurring/CardFileView.tsx` — Main layout (overdue, today, upcoming sections)
- `src/components/recurring/RecurringCard.tsx` — Individual card component
- `src/components/recurring/DeferPopover.tsx` — Defer/skip date picker popover

**API:**
- `GET /api/tasks/card-file` — Returns today's cards, overdue cards, and upcoming cards with recurring template info

**Code changes:**
- `src/components/recurring/RecurringCard.tsx`:
  - Color-coded left border based on frequency
  - Title, context badge, estimated time, frequency label, last completed
  - Complete button with animation
  - Defer popover (tomorrow / next week / pick date)
  - Skip button
- `src/components/recurring/CardFileView.tsx`:
  - Three sections: Overdue, Today's Cards, Upcoming
  - Frequency tabs for upcoming section
  - Total time estimate per section
- Navigation: add "Card File" link to Do Now sidebar/tabs

**Schema changes (Phase 4):**
- Add `color` and `estimatedMins` columns to `RecurringTemplate`
- Migration: `npx prisma migrate dev --name add-template-card-fields`

**Files touched:**
- `prisma/schema.prisma`
- `src/app/(dashboard)/do-now/card-file/page.tsx` (new)
- `src/components/recurring/CardFileView.tsx` (new)
- `src/components/recurring/RecurringCard.tsx` (new)
- `src/components/recurring/DeferPopover.tsx` (new)
- `src/app/api/tasks/card-file/route.ts` (new)
- Do Now navigation component (add Card File tab)

---

## 8. Key Files Reference

| File | What's There | What Changes |
|---|---|---|
| `prisma/schema.prisma` | `Task` (~line 412), `RecurringTemplate` (~line 556) | Add FK, color, estimatedMins |
| `src/lib/recurring.ts` | `parseSchedule()`, `generateTaskFromTemplate()`, `processRecurringTemplates()` | Add frequencies, recycling, return type |
| `src/lib/services/task-service.ts` | `completeTask()` (line 169-256) | Hook recycling after cascade |
| `src/lib/cascade.ts` | `CascadeResult` (line 4-10), `onTaskComplete()` (line 66) | Add `recycledTasks` field |
| `src/lib/tickler.ts` | `isTicklered()`, `ticklerWhere()`, `getDueToday()` | No changes (works as-is with scheduledDate) |
| `src/lib/validations/recurring.ts` | Schedule regex, Zod schemas | Extend regex for new frequencies |
| `src/components/recurring/SchedulePicker.tsx` | Frequency select UI | Add quarterly/yearly/every_n_days |
| `src/app/api/recurring-templates/generate/route.ts` | Manual generation trigger | No changes (complemented by cron) |
