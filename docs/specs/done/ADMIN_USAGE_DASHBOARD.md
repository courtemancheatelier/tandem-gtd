# Tandem Feature Spec: Admin Usage Dashboard

**Version:** 1.0  
**Date:** March 2, 2026  
**Author:** Jason Courtemanche  
**Status:** Draft  

---

## 1. Problem Statement

As a server admin running a Tandem instance for a community, you currently have no visibility into **adoption**. The existing admin page shows user accounts, permissions, and AI usage quotas — but nothing about whether people are actually *using* Tandem as a GTD system. You can't tell if someone signed up three months ago and never created a project, or if they're a power user running weekly reviews religiously.

Without this data, you're flying blind on questions like:

- Are beta users actually adopting GTD workflows, or just kicking the tires?
- Who might need a nudge or onboarding help?
- Is the system getting real traction before opening to more users?
- Which features are being used (inbox capture? weekly reviews? waiting-for tracking?) and which are being ignored?

This spec adds a **Usage Dashboard** section to the existing Admin Settings page that surfaces per-user and server-wide adoption metrics — read-only, lightweight, and built on data Tandem already collects.

---

## 2. Design Principles

- **Read-only analytics.** No new writes, no tracking pixels, no behavioral logging. Everything is derived from existing model counts and timestamps.
- **Respect the federated model.** This is for the server admin to understand their community — not a centralized analytics platform. Data never leaves the server.
- **Actionable, not voyeuristic.** Surface enough to answer "is this person engaged?" without exposing the content of anyone's tasks, projects, or inbox items. Counts and dates only.
- **Lightweight implementation.** Aggregate queries against existing tables. No new models, no materialized views, no background jobs. If it gets slow at scale, we optimize later.

---

## 3. Data Model

### 3.1 No Schema Changes Required

All metrics are computed from existing models. The queries aggregate counts from:

| Model | Metrics Derived |
|-------|----------------|
| `Task` | Total created, completed, active, completion rate |
| `Project` | Total created, active, completed, someday/maybe |
| `InboxItem` | Total captured, processed, unprocessed count, processing rate |
| `InboxEvent` | Processing sessions (distinct days with PROCESSED events), last processed date |
| `WaitingFor` | Total created, unresolved count |
| `WeeklyReview` | Total completed, last review date, streak |
| `Context` | Count (indicates setup effort) |
| `Area` | Count (indicates higher-horizon engagement) |
| `Goal` | Count (indicates horizon 3+ engagement) |
| `HorizonNote` | Count (indicates purpose/vision work) |
| `User` | `createdAt` for account age, `updatedAt` for last activity |

### 3.2 Computed Metrics

For each user, the API computes:

```typescript
interface UserUsageMetrics {
  userId: string;
  userName: string | null;
  email: string;
  accountCreated: string;        // ISO date
  lastActivity: string | null;   // Most recent updatedAt across all models

  // Core GTD counts
  tasks: {
    total: number;               // All tasks ever created
    active: number;              // NOT_STARTED + IN_PROGRESS
    completed: number;           // COMPLETED status
    dropped: number;             // DROPPED status
    completionRate: number;      // completed / (completed + dropped + active), 0-1
  };
  projects: {
    total: number;
    active: number;
    completed: number;
    somedayMaybe: number;        // isSomedayMaybe = true
  };
  inbox: {
    totalCaptured: number;       // All inbox items ever created
    totalProcessed: number;      // Status = PROCESSED or DELETED (went through the wizard)
    currentUnprocessed: number;  // Status = UNPROCESSED right now
    processingRate: number;      // totalProcessed / totalCaptured, 0-1
    processingSessions: number;  // Distinct days with at least one PROCESSED InboxEvent
    lastProcessedDate: string | null; // Most recent InboxEvent of type PROCESSED
    daysSinceLastProcessed: number | null;
  };
  waitingFor: {
    total: number;
    unresolved: number;
  };

  // Engagement signals
  weeklyReviews: {
    totalCompleted: number;
    lastReviewDate: string | null;
    daysSinceLastReview: number | null;
  };
  setupDepth: {
    contextCount: number;
    areaCount: number;
    goalCount: number;
    horizonNoteCount: number;
  };
}
```

### 3.3 Server-Wide Summary

Aggregated across all users:

```typescript
interface ServerUsageSummary {
  totalUsers: number;
  activeUsers: number;           // Users with any task/project activity in last 30 days
  totalTasks: number;
  totalProjects: number;
  totalInboxItems: number;
  totalInboxProcessed: number;   // Items that went through the processing wizard
  usersWhoProcessedInbox: number; // Users with at least 1 processed inbox item
  totalWeeklyReviews: number;
  averageTasksPerUser: number;
  averageProjectsPerUser: number;
  usersWhoCompletedReview: number; // Users with at least 1 completed review
}
```

---

## 4. API

### 4.1 Endpoint

```
GET /api/admin/usage
```

**Auth:** Requires admin session (reuse existing `requireAdmin()` helper).

**Response:**

```json
{
  "summary": { ... },           // ServerUsageSummary
  "users": [ ... ]              // UserUsageMetrics[]
}
```

### 4.2 Query Strategy

A single API call fetches all metrics using Prisma `groupBy` and `count` aggregations. The approach:

1. Fetch all users (already done in admin — small set for community servers).
2. For each model, run a single `groupBy({ by: ['userId'] })` with count aggregation.
3. Join results in-memory by userId.

This is efficient because community servers will have tens of users, not thousands. If a server grows beyond ~100 users, we can add pagination and per-user lazy loading later.

```typescript
// Pseudocode for the aggregation pattern
const [taskCounts, projectCounts, inboxCounts, inboxEventCounts, ...rest] = await Promise.all([
  prisma.task.groupBy({
    by: ['userId'],
    _count: { id: true },
    where: { /* optional status filters */ }
  }),
  prisma.project.groupBy({
    by: ['userId'],
    _count: { id: true },
  }),
  prisma.inboxItem.groupBy({
    by: ['userId'],
    _count: { id: true },
  }),
  // Inbox processing: count processed items per user
  prisma.inboxItem.groupBy({
    by: ['userId'],
    _count: { id: true },
    where: { status: { in: ['PROCESSED', 'DELETED'] } },
  }),
  // Processing sessions: use raw SQL for date-distinct counts
  prisma.$queryRaw`
    SELECT ii.user_id as "userId", 
           COUNT(DISTINCT DATE(ie.created_at)) as "sessionCount",
           MAX(ie.created_at) as "lastProcessed"
    FROM inbox_events ie
    JOIN inbox_items ii ON ie.inbox_item_id = ii.id
    WHERE ie.event_type = 'PROCESSED'
    GROUP BY ii.user_id
  `,
  // ... one query per metric group
]);
```

### 4.3 "Last Activity" Calculation

Last activity = the most recent `updatedAt` across a user's tasks, projects, and inbox items. This avoids adding a new column to User and uses existing timestamps:

```typescript
const lastTaskActivity = await prisma.task.findFirst({
  where: { userId },
  orderBy: { updatedAt: 'desc' },
  select: { updatedAt: true },
});
// Compare across models, take the most recent
```

For the batch query, this can be done with a raw SQL query using `GREATEST()` across subqueries to avoid N+1.

---

## 5. UI

### 5.1 Placement

Add a new **`UsageDashboard`** component to the existing admin settings page (`src/app/(dashboard)/settings/admin/page.tsx`), rendered between `ServerSettingsForm` and `UserManagementTable`:

```
Admin Settings
├── Server Settings Form (existing)
├── Usage Dashboard (NEW)
└── User Management Table (existing)
```

### 5.2 Server Summary Cards

A row of summary cards at the top of the Usage Dashboard section:

| Card | Value | Subtext |
|------|-------|---------|
| **Total Users** | `12` | `8 active in last 30 days` |
| **Tasks Created** | `347` | `avg 29/user` |
| **Projects Created** | `42` | `avg 3.5/user` |
| **Inbox Processed** | `89%` | `124 of 139 items, 9 users engaged` |
| **Weekly Reviews** | `18` | `6 users completed at least one` |

Use the existing `Card` / `CardHeader` / `CardContent` components from shadcn/ui. Keep the cards compact — this is a glance view, not a deep analytics page.

### 5.3 Per-User Usage Table

Below the summary cards, a table showing per-user breakdown. Columns:

| Column | Content | Sort |
|--------|---------|------|
| **User** | Name + email | Alpha |
| **Joined** | Relative date ("3 months ago") | Date |
| **Last Active** | Relative date, red if >14 days | Date |
| **Tasks** | `completed / total` with mini progress bar | Total |
| **Projects** | `active / total` | Total |
| **Inbox** | `processed / captured` with processing rate %, unprocessed badge if >0, last processed relative date | Rate |
| **Reviews** | Count completed, last review relative date | Count |
| **Setup** | Icon indicators for contexts/areas/goals configured | Score |

**Setup depth indicators** — show small icons or dots to indicate how much GTD infrastructure the user has configured:

- Contexts defined (shows they customized beyond defaults)
- Areas defined (engaging with horizons)
- Goals defined (higher-horizon thinking)
- Horizon notes written (purpose/vision work)

This gives a quick "how deep are they in" signal. A user with 50 tasks but zero contexts and no reviews is using Tandem as a todo list, not a GTD system.

### 5.5 Inbox Processing — The Key Adoption Signal

Inbox processing is arguably the single best indicator of GTD adoption. A user who captures items and processes them through the wizard is engaging with the core GTD workflow — the clarify step. A user who creates tasks directly but never uses inbox capture + processing is bypassing GTD methodology entirely.

The **processing rate** (`processed / captured`) reveals three user patterns:

- **High rate (>80%):** User captures and processes regularly. GTD is working.
- **Low rate (<50%):** User captures but doesn't process. Inbox is becoming a dumping ground — this user likely needs a nudge or guidance on the processing wizard.
- **Zero captures:** User creates tasks directly, never uses inbox. They may not understand the capture → clarify → organize flow, or they don't find it valuable. Training opportunity.

**Processing sessions** (distinct days with at least one `InboxEvent` of type `PROCESSED`) show *consistency* rather than volume. A user who processed 20 items in one sitting three months ago is different from a user who processes 2-3 items every few days. The session count tells you if inbox processing is a habit or a one-time event.

The query for processing sessions:

```typescript
// Count distinct dates where user processed inbox items
const sessions = await prisma.inboxEvent.groupBy({
  by: ['createdAt'],  // Will need date truncation
  where: {
    eventType: 'PROCESSED',
    inboxItem: { userId },
  },
});

// In practice, use raw SQL for date truncation:
// SELECT COUNT(DISTINCT DATE(created_at)) 
// FROM inbox_events ie
// JOIN inbox_items ii ON ie.inbox_item_id = ii.id
// WHERE ii.user_id = $1 AND ie.event_type = 'PROCESSED'
```

**`daysSinceLastProcessed`** serves as an early warning. If it's been >14 days since a user last processed their inbox, they're likely falling off the GTD wagon — that's a good trigger for the admin to reach out with guidance or training.

### 5.4 Visual Engagement Signal

Each user row gets a simple engagement indicator:

```typescript
function getEngagementLevel(metrics: UserUsageMetrics): 
  'active' | 'drifting' | 'dormant' | 'new' {
  
  const daysSinceActivity = /* compute from lastActivity */;
  const accountAgeDays = /* compute from accountCreated */;
  
  if (accountAgeDays < 7) return 'new';
  if (daysSinceActivity <= 7) return 'active';
  if (daysSinceActivity <= 30) return 'drifting';
  return 'dormant';
}
```

Displayed as a colored badge: green (active), yellow (drifting), gray (dormant), blue (new).

---

## 6. Implementation Plan

### 6.1 Files to Create

```
src/app/api/admin/usage/route.ts          — API endpoint
src/components/admin/UsageDashboard.tsx    — Main dashboard component
src/components/admin/UsageSummaryCards.tsx  — Server-wide summary cards
src/components/admin/UserUsageTable.tsx    — Per-user usage table
```

### 6.2 Files to Modify

```
src/app/(dashboard)/settings/admin/page.tsx  — Add UsageDashboard between existing sections
```

### 6.3 Build Order

1. **API route** — `GET /api/admin/usage` with all aggregation queries
2. **Summary cards** — Server-wide stats, simple Card grid
3. **User usage table** — Per-user rows with all columns
4. **Engagement badges** — Active/drifting/dormant/new indicators
5. **Integration** — Wire into admin settings page

### 6.4 No Migration Required

Zero schema changes. This feature is purely additive — read-only queries against existing data.

---

## 7. Future Enhancements (Out of Scope for v1)

These are deliberately excluded from the initial implementation but noted for later:

- **Time-series charts:** Tasks created per week, review completion trend over time. Requires either event sourcing queries or a lightweight analytics table.
- **Cohort analysis:** Group users by signup month, track retention curves.
- **Export to CSV:** Download the usage table for external analysis.
- **Usage alerts:** Notify admin when a user goes dormant (email or in-app notification).
- **Per-feature adoption:** Track which specific features are used (e.g., percentage of users using contexts, energy levels, scheduled dates) to inform development priorities.

---

## 8. Privacy Considerations

- Metrics are **counts and timestamps only** — never task titles, project names, or inbox content.
- Only users with `isAdmin = true` can access the endpoint.
- Aligns with the federated model: the server admin already has database access and *could* run these queries manually. This just surfaces them in the UI.
- No data leaves the server. No third-party analytics. No tracking beyond what the application already records through normal CRUD operations.
