# Insights Dashboard — Productivity Analytics & Trends

> **Status:** Draft
> **Last updated:** 2026-02-23

---

## 1. Problem Statement

### What Exists

Tandem has a **PM Dashboard** (`/` route, `src/components/dashboard/DashboardGrid.tsx`) with project-centric widgets:
- **Project Health** — traffic-light status per root project (GREEN/YELLOW/RED)
- **Progress Bars** — rollup completion percentage per project
- **Velocity** — tasks completed per week over 12 weeks (area chart via Recharts)
- **Burn-Down** — estimated hours remaining over 90 days
- **Blocked Queue** — tasks with incomplete predecessors
- **Stale Projects** — projects with no activity in 14+ days
- **Milestones** — upcoming milestone tasks in next 30 days

All powered by a single `GET /api/dashboard/stats` endpoint (`src/app/api/dashboard/stats/route.ts`).

### The Gap

The PM dashboard answers "how are my projects doing?" but not "how is my GTD system doing?" A GTD practitioner needs different questions answered:

1. **Am I capturing enough?** — capture rate vs. processing rate. If capture > processing, the inbox grows and trust in the system erodes.
2. **Am I completing tasks?** — task completion rate over time. Trends show if productivity is improving or declining.
3. **How long do things take?** — time-to-done (creation to completion) reveals if tasks are sitting around or getting done promptly.
4. **Where do I work?** — context distribution shows which environments dominate. Energy distribution shows if work is balanced.
5. **Am I doing my reviews?** — weekly review streak. The review is the beating heart of GTD; skipping it degrades the whole system.
6. **Is my system healthy?** — a composite score: inbox clear, no stale projects, reviews on track, next actions everywhere.

None of these are visible today. The user has no feedback loop on their GTD practice itself.

### What Done Looks Like

A `/insights` page with time-range-selectable charts and metrics showing capture rate, processing rate, completion rate, context/energy distribution, weekly review streak, overdue trends, and a composite system health score. The page loads quickly even for users with thousands of tasks (via pre-computed aggregates for large datasets).

---

## 2. Data Model Changes

### InsightSnapshot (Pre-Computed Daily Aggregates)

For performance on large datasets, pre-compute daily aggregates. This avoids expensive `GROUP BY` queries on every page load.

```prisma
model InsightSnapshot {
  id              String   @id @default(cuid())
  date            DateTime @db.Date    // The day this snapshot covers
  userId          String

  // Capture & Processing
  inboxCreated    Int      @default(0) // Inbox items created this day
  inboxProcessed  Int      @default(0) // Inbox items processed this day

  // Tasks
  tasksCreated    Int      @default(0) // Tasks created this day
  tasksCompleted  Int      @default(0) // Tasks completed this day

  // State snapshot (end-of-day counts)
  overdueCount    Int      @default(0) // Tasks overdue as of end of day
  activeProjectCount Int   @default(0) // Active projects as of end of day
  inboxBacklog    Int      @default(0) // Unprocessed inbox items at end of day

  createdAt       DateTime @default(now())

  @@unique([userId, date])
  @@index([userId, date])
}
```

Migration: `npx prisma migrate dev --name add-insight-snapshot`

### No Changes to Existing Models

All metrics are derived from existing data: `Task.createdAt`, `Task.completedAt`, `InboxItem.createdAt`, `InboxItem.status`, `WeeklyReview.completedAt`, etc. The `InsightSnapshot` is a performance optimization, not a new data source.

---

## 3. Metrics & Charts

### 3.1 Capture Rate vs. Processing Rate (Line Chart)

**What it shows:** Daily/weekly count of inbox items created (captured) vs. inbox items processed. When capture exceeds processing consistently, the inbox backlog grows.

**Data source:** `InboxItem.createdAt` for captures. `InboxItem` where status changed to PROCESSED (tracked via `updatedAt` and status) for processing.

**Chart type:** Dual-line chart (Recharts `LineChart`). Capture line = blue. Processing line = green. Gap area shaded when capture > processing (warning).

### 3.2 Task Completion Rate (Bar Chart)

**What it shows:** Tasks completed per day or per week (based on time range). Includes a trend line (rolling 7-day average).

**Data source:** `Task.completedAt` within the time range.

**Chart type:** `BarChart` with bars for each period. Rolling average as a `Line` overlay (Recharts `ComposedChart`).

### 3.3 Average Time-to-Done (Line Chart)

**What it shows:** Average number of days from `Task.createdAt` to `Task.completedAt` over time. Calculated per week.

**Data source:** Completed tasks within the range. `completedAt - createdAt` in days.

**Chart type:** `AreaChart` with a single area. Lower is better. Show the median as well (less sensitive to outliers).

### 3.4 Context Distribution (Donut Chart)

**What it shows:** Completed tasks broken down by context. Shows where the user spends their time.

**Data source:** Completed tasks with `contextId` within the range. JOIN to `Context.name` and `Context.color`.

**Chart type:** `PieChart` (donut variant via inner/outer radius). Each slice = a context. "No context" as a gray slice.

### 3.5 Energy Distribution (Horizontal Bar Chart)

**What it shows:** Completed tasks by energy level (LOW / MEDIUM / HIGH / unset).

**Data source:** Completed tasks with `energyLevel` within the range.

**Chart type:** Horizontal `BarChart` with 4 bars. Color-coded: green (LOW), yellow (MEDIUM), red (HIGH), gray (unset).

### 3.6 Weekly Review Streak (Stat + Calendar Heatmap)

**What it shows:** How many consecutive weeks the user completed a weekly review. Plus a small calendar heatmap showing reviewed vs. missed weeks over the time range.

**Data source:** `WeeklyReview` records where `status = COMPLETED`. Group by `weekOf`.

**Chart type:** Large number (streak count) + small grid of weeks (green = reviewed, gray = missed). The grid is a simple CSS grid, not a Recharts chart.

### 3.7 Overdue Trend (Area Chart)

**What it shows:** Count of overdue tasks over time. Should trend downward if the system is working.

**Data source:** For each day/week in the range, count tasks where `dueDate < that day` AND `status NOT IN (COMPLETED, DROPPED)`. This requires either re-querying historical state or using the `InsightSnapshot.overdueCount`.

**Chart type:** `AreaChart`. Red fill. Lower is better.

### 3.8 Inbox Zero Streak (Stat)

**What it shows:** Consecutive days where the inbox had zero unprocessed items at end of day.

**Data source:** `InsightSnapshot.inboxBacklog` = 0 for consecutive days, or daily check of `InboxItem` where `status = UNPROCESSED`.

**Display:** Large number with a secondary stat showing "longest streak: N days."

### 3.9 System Health Score (Gauge / Letter Grade)

**What it shows:** A composite metric from 0-100 (or A-F grade) based on:

| Factor | Weight | Scoring |
|---|---|---|
| Inbox < 10 unprocessed | 20% | 0 items = 100%, 1-5 = 80%, 6-10 = 50%, 11-20 = 20%, >20 = 0% |
| No stale projects (7+ days inactive) | 20% | 0 stale = 100%, 1-2 = 70%, 3-5 = 30%, >5 = 0% |
| Weekly review done this week | 25% | Done = 100%, 1 week ago = 70%, 2 weeks = 30%, 3+ weeks = 0% |
| All active projects have a next action | 20% | All have = 100%, >80% have = 70%, >50% = 30%, <50% = 0% |
| No overdue tasks | 15% | 0 = 100%, 1-3 = 70%, 4-10 = 30%, >10 = 0% |

**Display:** Large circular gauge or letter grade (A/B/C/D/F) with each factor listed below with its individual score.

```typescript
function computeHealthScore(data: {
  inboxCount: number;
  staleProjectCount: number;
  daysSinceReview: number | null;
  projectsWithNextAction: number;
  totalActiveProjects: number;
  overdueCount: number;
}): { score: number; grade: string; factors: HealthFactor[] } {
  const factors: HealthFactor[] = [];

  // Inbox factor (20%)
  let inboxScore: number;
  if (data.inboxCount === 0) inboxScore = 100;
  else if (data.inboxCount <= 5) inboxScore = 80;
  else if (data.inboxCount <= 10) inboxScore = 50;
  else if (data.inboxCount <= 20) inboxScore = 20;
  else inboxScore = 0;
  factors.push({
    name: "Inbox clear",
    score: inboxScore,
    status: inboxScore >= 70 ? "good" : inboxScore >= 40 ? "warning" : "critical",
    detail: `${data.inboxCount} unprocessed items`,
  });

  // Stale projects factor (20%)
  let staleScore: number;
  if (data.staleProjectCount === 0) staleScore = 100;
  else if (data.staleProjectCount <= 2) staleScore = 70;
  else if (data.staleProjectCount <= 5) staleScore = 30;
  else staleScore = 0;
  factors.push({
    name: "No stale projects",
    score: staleScore,
    status: staleScore >= 70 ? "good" : staleScore >= 40 ? "warning" : "critical",
    detail: `${data.staleProjectCount} stale projects`,
  });

  // Review factor (25%)
  let reviewScore: number;
  if (data.daysSinceReview === null) reviewScore = 0;
  else if (data.daysSinceReview <= 7) reviewScore = 100;
  else if (data.daysSinceReview <= 14) reviewScore = 70;
  else if (data.daysSinceReview <= 21) reviewScore = 30;
  else reviewScore = 0;
  factors.push({
    name: "Weekly review",
    score: reviewScore,
    status: reviewScore >= 70 ? "good" : reviewScore >= 40 ? "warning" : "critical",
    detail: data.daysSinceReview !== null
      ? `${data.daysSinceReview} days since last review`
      : "Never reviewed",
  });

  // Next actions factor (20%)
  const nextActionRatio = data.totalActiveProjects > 0
    ? data.projectsWithNextAction / data.totalActiveProjects
    : 1;
  let nextActionScore: number;
  if (nextActionRatio === 1) nextActionScore = 100;
  else if (nextActionRatio >= 0.8) nextActionScore = 70;
  else if (nextActionRatio >= 0.5) nextActionScore = 30;
  else nextActionScore = 0;
  factors.push({
    name: "Next actions defined",
    score: nextActionScore,
    status: nextActionScore >= 70 ? "good" : nextActionScore >= 40 ? "warning" : "critical",
    detail: `${data.projectsWithNextAction}/${data.totalActiveProjects} projects have next actions`,
  });

  // Overdue factor (15%)
  let overdueScore: number;
  if (data.overdueCount === 0) overdueScore = 100;
  else if (data.overdueCount <= 3) overdueScore = 70;
  else if (data.overdueCount <= 10) overdueScore = 30;
  else overdueScore = 0;
  factors.push({
    name: "No overdue tasks",
    score: overdueScore,
    status: overdueScore >= 70 ? "good" : overdueScore >= 40 ? "warning" : "critical",
    detail: `${data.overdueCount} overdue tasks`,
  });

  // Weighted average
  const score = Math.round(
    inboxScore * 0.20 +
    staleScore * 0.20 +
    reviewScore * 0.25 +
    nextActionScore * 0.20 +
    overdueScore * 0.15
  );

  let grade: string;
  if (score >= 90) grade = "A";
  else if (score >= 80) grade = "B";
  else if (score >= 65) grade = "C";
  else if (score >= 50) grade = "D";
  else grade = "F";

  return { score, grade, factors };
}

interface HealthFactor {
  name: string;
  score: number;
  status: "good" | "warning" | "critical";
  detail: string;
}
```

---

## 4. API Design

### 4.1 Insights Endpoint

`GET /api/insights`

Query params:
- `range` — `7d`, `30d`, `90d`, `1y`, `all` (default: `30d`)

Returns all metrics for the given range.

```typescript
// src/app/api/insights/route.ts

interface InsightsResponse {
  range: string;
  captureRate: Array<{ date: string; captured: number; processed: number }>;
  completionRate: Array<{ date: string; completed: number }>;
  timeToDone: Array<{ week: string; averageDays: number; medianDays: number }>;
  contextDistribution: Array<{ context: string; count: number; color: string | null }>;
  energyDistribution: Array<{ level: string; count: number }>;
  reviewStreak: {
    current: number;
    longest: number;
    weeks: Array<{ weekOf: string; completed: boolean }>;
  };
  overdueTrend: Array<{ date: string; count: number }>;
  inboxZeroStreak: { current: number; longest: number };
  healthScore: {
    score: number;
    grade: string;
    factors: HealthFactor[];
  };
}
```

### 4.2 Implementation

```typescript
// src/app/api/insights/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, unauthorized } from "@/lib/api/auth-helpers";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const { searchParams } = new URL(req.url);
  const range = searchParams.get("range") || "30d";

  const now = new Date();
  let startDate: Date;
  switch (range) {
    case "7d":
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7);
      break;
    case "30d":
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 30);
      break;
    case "90d":
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 90);
      break;
    case "1y":
      startDate = new Date(now);
      startDate.setFullYear(startDate.getFullYear() - 1);
      break;
    case "all":
      startDate = new Date(0);
      break;
    default:
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 30);
  }

  // Run all independent queries in parallel
  const [
    completedTasks,
    createdTasks,
    inboxItems,
    processedInbox,
    contexts,
    weeklyReviews,
    activeProjects,
    overdueTasks,
    currentInbox,
  ] = await Promise.all([
    // Completed tasks in range
    prisma.task.findMany({
      where: {
        userId,
        status: "COMPLETED",
        completedAt: { gte: startDate },
      },
      select: {
        id: true,
        completedAt: true,
        createdAt: true,
        contextId: true,
        energyLevel: true,
        context: { select: { name: true, color: true } },
      },
    }),

    // Created tasks in range (for creation rate)
    prisma.task.groupBy({
      by: ["createdAt"],
      where: { userId, createdAt: { gte: startDate } },
      _count: true,
    }),

    // Inbox items created in range
    prisma.inboxItem.findMany({
      where: { userId, createdAt: { gte: startDate } },
      select: { createdAt: true },
    }),

    // Inbox items processed in range
    prisma.inboxItem.findMany({
      where: {
        userId,
        status: { in: ["PROCESSED", "DELETED"] },
        updatedAt: { gte: startDate },
      },
      select: { updatedAt: true },
    }),

    // Contexts for distribution labels
    prisma.context.findMany({
      where: { userId },
      select: { id: true, name: true, color: true },
    }),

    // Weekly reviews for streak calculation
    prisma.weeklyReview.findMany({
      where: { userId, status: "COMPLETED" },
      orderBy: { weekOf: "desc" },
      select: { weekOf: true, completedAt: true },
      take: 52,
    }),

    // Active projects for health score
    prisma.project.findMany({
      where: { userId, status: "ACTIVE" },
      select: {
        id: true,
        updatedAt: true,
        tasks: {
          where: { status: { notIn: ["COMPLETED", "DROPPED"] } },
          select: { isNextAction: true, updatedAt: true },
        },
      },
    }),

    // Current overdue count
    prisma.task.count({
      where: {
        userId,
        dueDate: { lt: now },
        status: { notIn: ["COMPLETED", "DROPPED"] },
      },
    }),

    // Current inbox count
    prisma.inboxItem.count({
      where: { userId, status: "UNPROCESSED" },
    }),
  ]);

  // === Capture vs Processing Rate ===
  const captureByDay = groupByDay(inboxItems.map((i) => i.createdAt));
  const processByDay = groupByDay(processedInbox.map((i) => i.updatedAt));
  const allDays = getAllDays(startDate, now);
  const captureRate = allDays.map((date) => ({
    date,
    captured: captureByDay[date] || 0,
    processed: processByDay[date] || 0,
  }));

  // === Completion Rate ===
  const completionByDay = groupByDay(
    completedTasks.map((t) => t.completedAt!).filter(Boolean)
  );
  const completionRate = allDays.map((date) => ({
    date,
    completed: completionByDay[date] || 0,
  }));

  // === Time to Done ===
  const completedWithTimes = completedTasks
    .filter((t) => t.completedAt && t.createdAt)
    .map((t) => ({
      week: getMonday(t.completedAt!).toISOString().slice(0, 10),
      days: (t.completedAt!.getTime() - t.createdAt.getTime()) / 86400000,
    }));

  const byWeek = new Map<string, number[]>();
  for (const item of completedWithTimes) {
    if (!byWeek.has(item.week)) byWeek.set(item.week, []);
    byWeek.get(item.week)!.push(item.days);
  }

  const timeToDone = Array.from(byWeek.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, days]) => {
      const sorted = [...days].sort((a, b) => a - b);
      const avg = days.reduce((s, d) => s + d, 0) / days.length;
      const median = sorted[Math.floor(sorted.length / 2)];
      return {
        week,
        averageDays: Math.round(avg * 10) / 10,
        medianDays: Math.round(median * 10) / 10,
      };
    });

  // === Context Distribution ===
  const contextCounts = new Map<string, number>();
  for (const task of completedTasks) {
    const key = task.context?.name || "No context";
    contextCounts.set(key, (contextCounts.get(key) || 0) + 1);
  }
  const contextDistribution = Array.from(contextCounts.entries())
    .map(([context, count]) => {
      const ctx = contexts.find((c) => c.name === context);
      return { context, count, color: ctx?.color || null };
    })
    .sort((a, b) => b.count - a.count);

  // === Energy Distribution ===
  const energyCounts = { LOW: 0, MEDIUM: 0, HIGH: 0, UNSET: 0 };
  for (const task of completedTasks) {
    if (task.energyLevel) {
      energyCounts[task.energyLevel as keyof typeof energyCounts]++;
    } else {
      energyCounts.UNSET++;
    }
  }
  const energyDistribution = [
    { level: "LOW", count: energyCounts.LOW },
    { level: "MEDIUM", count: energyCounts.MEDIUM },
    { level: "HIGH", count: energyCounts.HIGH },
    { level: "Unset", count: energyCounts.UNSET },
  ];

  // === Review Streak ===
  const reviewWeeks = new Set(
    weeklyReviews.map((r) => getMonday(r.weekOf).toISOString().slice(0, 10))
  );

  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;
  const currentMonday = getMonday(now);

  // Calculate current streak (counting back from this week)
  for (let i = 0; i < 52; i++) {
    const checkWeek = new Date(currentMonday);
    checkWeek.setDate(checkWeek.getDate() - i * 7);
    const weekKey = checkWeek.toISOString().slice(0, 10);
    if (reviewWeeks.has(weekKey)) {
      currentStreak++;
    } else {
      break;
    }
  }

  // Calculate longest streak
  const allReviewWeeks = Array.from(reviewWeeks).sort();
  tempStreak = 0;
  for (let i = 0; i < allReviewWeeks.length; i++) {
    if (i === 0) {
      tempStreak = 1;
    } else {
      const prev = new Date(allReviewWeeks[i - 1]);
      const curr = new Date(allReviewWeeks[i]);
      const diffDays = (curr.getTime() - prev.getTime()) / 86400000;
      if (Math.abs(diffDays - 7) <= 1) {
        tempStreak++;
      } else {
        tempStreak = 1;
      }
    }
    longestStreak = Math.max(longestStreak, tempStreak);
  }

  // Build weeks array for heatmap
  const reviewWeeksArray = allDays
    .filter((_, i) => i % 7 === 0)
    .map((date) => ({
      weekOf: date,
      completed: reviewWeeks.has(getMonday(new Date(date)).toISOString().slice(0, 10)),
    }));

  const reviewStreakData = {
    current: currentStreak,
    longest: longestStreak,
    weeks: reviewWeeksArray,
  };

  // === Inbox Zero Streak ===
  // Simplified: check from today backwards
  // For accurate historical data, use InsightSnapshot (Phase 6)
  const inboxZeroStreak = { current: currentInbox === 0 ? 1 : 0, longest: 0 };

  // === Health Score ===
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const staleProjectCount = activeProjects.filter((p) => {
    const latestActivity = p.tasks.reduce(
      (max, t) => (t.updatedAt > max ? t.updatedAt : max),
      p.updatedAt
    );
    return latestActivity < sevenDaysAgo;
  }).length;

  const projectsWithNextAction = activeProjects.filter((p) =>
    p.tasks.some((t) => t.isNextAction)
  ).length;

  const daysSinceReview = weeklyReviews.length > 0 && weeklyReviews[0].completedAt
    ? Math.floor((now.getTime() - weeklyReviews[0].completedAt.getTime()) / 86400000)
    : null;

  const healthScore = computeHealthScore({
    inboxCount: currentInbox,
    staleProjectCount,
    daysSinceReview,
    projectsWithNextAction,
    totalActiveProjects: activeProjects.length,
    overdueCount: overdueTasks,
  });

  return NextResponse.json({
    range,
    captureRate,
    completionRate,
    timeToDone,
    contextDistribution,
    energyDistribution,
    reviewStreak: reviewStreakData,
    overdueTrend: [], // Requires InsightSnapshot for historical data (Phase 6)
    inboxZeroStreak,
    healthScore,
  });
}

// === Helper Functions ===

function groupByDay(dates: Date[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const date of dates) {
    const key = date.toISOString().slice(0, 10);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function getAllDays(start: Date, end: Date): string[] {
  const days: string[] = [];
  const current = new Date(start);
  current.setHours(0, 0, 0, 0);
  while (current <= end) {
    days.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }
  return days;
}

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function computeHealthScore(data: {
  inboxCount: number;
  staleProjectCount: number;
  daysSinceReview: number | null;
  projectsWithNextAction: number;
  totalActiveProjects: number;
  overdueCount: number;
}): { score: number; grade: string; factors: Array<{ name: string; score: number; status: string; detail: string }> } {
  const factors = [];

  // Inbox (20%)
  let inboxScore: number;
  if (data.inboxCount === 0) inboxScore = 100;
  else if (data.inboxCount <= 5) inboxScore = 80;
  else if (data.inboxCount <= 10) inboxScore = 50;
  else if (data.inboxCount <= 20) inboxScore = 20;
  else inboxScore = 0;
  factors.push({ name: "Inbox clear", score: inboxScore, status: inboxScore >= 70 ? "good" : inboxScore >= 40 ? "warning" : "critical", detail: `${data.inboxCount} unprocessed` });

  // Stale (20%)
  let staleScore: number;
  if (data.staleProjectCount === 0) staleScore = 100;
  else if (data.staleProjectCount <= 2) staleScore = 70;
  else if (data.staleProjectCount <= 5) staleScore = 30;
  else staleScore = 0;
  factors.push({ name: "No stale projects", score: staleScore, status: staleScore >= 70 ? "good" : staleScore >= 40 ? "warning" : "critical", detail: `${data.staleProjectCount} stale` });

  // Review (25%)
  let reviewScore: number;
  if (data.daysSinceReview === null) reviewScore = 0;
  else if (data.daysSinceReview <= 7) reviewScore = 100;
  else if (data.daysSinceReview <= 14) reviewScore = 70;
  else if (data.daysSinceReview <= 21) reviewScore = 30;
  else reviewScore = 0;
  factors.push({ name: "Weekly review", score: reviewScore, status: reviewScore >= 70 ? "good" : reviewScore >= 40 ? "warning" : "critical", detail: data.daysSinceReview !== null ? `${data.daysSinceReview}d ago` : "Never" });

  // Next actions (20%)
  const ratio = data.totalActiveProjects > 0 ? data.projectsWithNextAction / data.totalActiveProjects : 1;
  let naScore: number;
  if (ratio === 1) naScore = 100;
  else if (ratio >= 0.8) naScore = 70;
  else if (ratio >= 0.5) naScore = 30;
  else naScore = 0;
  factors.push({ name: "Next actions defined", score: naScore, status: naScore >= 70 ? "good" : naScore >= 40 ? "warning" : "critical", detail: `${data.projectsWithNextAction}/${data.totalActiveProjects}` });

  // Overdue (15%)
  let odScore: number;
  if (data.overdueCount === 0) odScore = 100;
  else if (data.overdueCount <= 3) odScore = 70;
  else if (data.overdueCount <= 10) odScore = 30;
  else odScore = 0;
  factors.push({ name: "No overdue tasks", score: odScore, status: odScore >= 70 ? "good" : odScore >= 40 ? "warning" : "critical", detail: `${data.overdueCount} overdue` });

  const score = Math.round(inboxScore * 0.20 + staleScore * 0.20 + reviewScore * 0.25 + naScore * 0.20 + odScore * 0.15);
  let grade: string;
  if (score >= 90) grade = "A";
  else if (score >= 80) grade = "B";
  else if (score >= 65) grade = "C";
  else if (score >= 50) grade = "D";
  else grade = "F";

  return { score, grade, factors };
}
```

### 4.3 Snapshot Generation Cron

`POST /api/cron/insights`

Runs daily (after midnight). Computes yesterday's metrics and upserts into `InsightSnapshot`.

```typescript
// src/app/api/cron/insights/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  const endOfYesterday = new Date(yesterday);
  endOfYesterday.setHours(23, 59, 59, 999);

  const users = await prisma.user.findMany({
    where: { isDisabled: false },
    select: { id: true },
  });

  let processed = 0;

  for (const user of users) {
    const [inboxCreated, inboxProcessed, tasksCreated, tasksCompleted, overdueCount, activeProjectCount, inboxBacklog] = await Promise.all([
      prisma.inboxItem.count({
        where: { userId: user.id, createdAt: { gte: yesterday, lte: endOfYesterday } },
      }),
      prisma.inboxItem.count({
        where: {
          userId: user.id,
          status: { in: ["PROCESSED", "DELETED"] },
          updatedAt: { gte: yesterday, lte: endOfYesterday },
        },
      }),
      prisma.task.count({
        where: { userId: user.id, createdAt: { gte: yesterday, lte: endOfYesterday } },
      }),
      prisma.task.count({
        where: {
          userId: user.id,
          status: "COMPLETED",
          completedAt: { gte: yesterday, lte: endOfYesterday },
        },
      }),
      prisma.task.count({
        where: {
          userId: user.id,
          dueDate: { lt: endOfYesterday },
          status: { notIn: ["COMPLETED", "DROPPED"] },
        },
      }),
      prisma.project.count({
        where: { userId: user.id, status: "ACTIVE" },
      }),
      prisma.inboxItem.count({
        where: { userId: user.id, status: "UNPROCESSED" },
      }),
    ]);

    await prisma.insightSnapshot.upsert({
      where: {
        userId_date: { userId: user.id, date: yesterday },
      },
      create: {
        userId: user.id,
        date: yesterday,
        inboxCreated,
        inboxProcessed,
        tasksCreated,
        tasksCompleted,
        overdueCount,
        activeProjectCount,
        inboxBacklog,
      },
      update: {
        inboxCreated,
        inboxProcessed,
        tasksCreated,
        tasksCompleted,
        overdueCount,
        activeProjectCount,
        inboxBacklog,
      },
    });

    processed++;
  }

  return NextResponse.json({ processed });
}
```

---

## 5. UI Design

### 5.1 Page Route

`/insights` — new page in the `(dashboard)` layout group.

File: `src/app/(dashboard)/insights/page.tsx`

### 5.2 Navigation Placement

In `src/components/layout/nav.tsx`, add to the "Reflect" section (between "Horizons" and "Weekly Review"):

```typescript
// In navSections, "Reflect" section:
{
  label: "Reflect",
  items: [
    { href: "/areas", label: "Areas", icon: Layers },
    { href: "/horizons", label: "Horizons", icon: Mountain },
    { href: "/insights", label: "Insights", icon: BarChart3 },  // NEW
    { href: "/review", label: "Weekly Review", icon: RotateCcw },
  ],
},
```

Import `BarChart3` from `lucide-react`.

### 5.3 Page Layout

```
+-----------------------------------------------------------------+
|  Insights                         [7d] [30d] [90d] [1y] [All]  |
+-----------------------------------------------------------------+
|                                                                  |
|  +------------------------+  +------------------------+         |
|  |  SYSTEM HEALTH: A      |  |  WEEKLY REVIEW STREAK  |         |
|  |  ############## 87%    |  |       12 weeks         |         |
|  |                        |  |  ==================    |         |
|  |  OK  Inbox clear       |  |  longest: 15 weeks    |         |
|  |  OK  Reviews on track  |  +------------------------+         |
|  |  !!  2 stale projects  |                                     |
|  |  OK  Next actions OK   |  +------------------------+         |
|  |  OK  No overdue tasks  |  |  INBOX ZERO STREAK     |         |
|  +------------------------+  |      5 days            |         |
|                               |  longest: 21 days     |         |
|                               +------------------------+         |
|                                                                  |
|  +----------------------------------------------------------+   |
|  |  CAPTURE vs PROCESSING RATE                               |   |
|  |  --- Captured   --- Processed                             |   |
|  |  [dual line chart over time]                              |   |
|  +----------------------------------------------------------+   |
|                                                                  |
|  +----------------------------------------------------------+   |
|  |  TASK COMPLETION RATE                                     |   |
|  |  [bar chart with rolling average trend line]              |   |
|  +----------------------------------------------------------+   |
|                                                                  |
|  +------------------------+  +------------------------+         |
|  |  CONTEXT DISTRIBUTION  |  |  ENERGY DISTRIBUTION   |         |
|  |  [donut chart]         |  |  [horizontal bars]     |         |
|  +------------------------+  +------------------------+         |
|                                                                  |
|  +----------------------------------------------------------+   |
|  |  TIME TO DONE                                             |   |
|  |  [area chart - avg days from creation to completion]      |   |
|  +----------------------------------------------------------+   |
|                                                                  |
|  +----------------------------------------------------------+   |
|  |  OVERDUE TREND                                            |   |
|  |  [area chart - count of overdue tasks over time]          |   |
|  +----------------------------------------------------------+   |
|                                                                  |
+-----------------------------------------------------------------+
```

On mobile: cards stack vertically, full width. The time range selector becomes a dropdown instead of button group.

### 5.4 Component Structure

```
src/app/(dashboard)/insights/page.tsx           — Page route (server component)
src/components/insights/
  InsightsPage.tsx                               — Client component with time range selector + grid
  HealthScoreWidget.tsx                          — System health gauge with factor breakdown
  ReviewStreakWidget.tsx                          — Review streak number + week heatmap grid
  InboxZeroWidget.tsx                            — Inbox zero streak stat card
  CaptureProcessingChart.tsx                     — Dual-line chart (Recharts LineChart)
  CompletionRateChart.tsx                        — Bar chart with trend (Recharts ComposedChart)
  ContextDistributionChart.tsx                   — Donut chart (Recharts PieChart)
  EnergyDistributionChart.tsx                    — Horizontal bar chart (Recharts BarChart)
  TimeToDoneChart.tsx                            — Area chart (Recharts AreaChart)
  OverdueTrendChart.tsx                          — Area chart (Recharts AreaChart)
```

All chart components use Recharts (already installed: `recharts@^3.7.0`). Follow the pattern established in `src/components/dashboard/VelocityWidget.tsx`: `ResponsiveContainer`, consistent Tailwind-based styling via CSS variables (`hsl(var(--primary))`), same tooltip styling.

### 5.5 Example Chart Component

Following the VelocityWidget pattern:

```typescript
// src/components/insights/CompletionRateChart.tsx

"use client";

import {
  Card, CardHeader, CardTitle, CardContent, CardDescription,
} from "@/components/ui/card";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";

interface CompletionRateData {
  date: string;
  completed: number;
}

export function CompletionRateChart({ data }: { data: CompletionRateData[] }) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Task Completion Rate</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No completed tasks yet</p>
        </CardContent>
      </Card>
    );
  }

  // Calculate rolling 7-day average
  const withAverage = data.map((item, i) => {
    const window = data.slice(Math.max(0, i - 6), i + 1);
    const avg = window.reduce((s, d) => s + d.completed, 0) / window.length;
    return { ...item, average: Math.round(avg * 10) / 10 };
  });

  const total = data.reduce((s, d) => s + d.completed, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Task Completion Rate</CardTitle>
            <CardDescription>Tasks completed per day</CardDescription>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold">{total}</p>
            <p className="text-xs text-muted-foreground">total in period</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={withAverage}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={(val) => {
                  const d = new Date(String(val) + "T00:00:00");
                  return `${d.getMonth() + 1}/${d.getDate()}`;
                }}
                className="text-muted-foreground"
              />
              <YAxis
                tick={{ fontSize: 11 }}
                className="text-muted-foreground"
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "6px",
                  fontSize: "12px",
                }}
                labelFormatter={(label) => new Date(String(label) + "T00:00:00").toLocaleDateString()}
              />
              <Bar
                dataKey="completed"
                fill="hsl(var(--primary))"
                opacity={0.6}
                radius={[2, 2, 0, 0]}
              />
              <Line
                type="monotone"
                dataKey="average"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
```

---

## 6. Edge Cases

- **New users with no data:** Show empty states with encouraging messages: "Start capturing items and you'll see trends here within a week."
- **Users with only a few tasks:** Charts should still render with fewer data points. Use minimum axis ranges to avoid weird scaling (e.g., Y axis always starts at 0).
- **Timezone consistency:** Use UTC for all date aggregation. `InsightSnapshot.date` is a `@db.Date` (no time component).
- **Deleted tasks:** Tasks that were hard-deleted before the InsightSnapshot feature was added will not be counted retroactively. Accept this as a limitation; going forward, all data is captured.
- **Very large datasets (10K+ tasks):** On-demand aggregation may be slow for "all time" range. The `InsightSnapshot` table handles this. For on-demand queries within 90 days, the existing indexes on `(userId, completedAt)` and `(userId, createdAt)` on `Task` are sufficient.
- **Review streak calculation:** A "week" is Monday-to-Sunday. If the user completes a review on Sunday, it counts for that week. The streak only counts consecutive weeks with no gaps.
- **Health score edge case:** a user with zero active projects gets 100% on the "next actions defined" factor (0/0 = all covered). This is intentional — no projects means no next-action problem.
- **Overdue trend historical accuracy:** Without InsightSnapshot data, the overdue trend cannot be computed retroactively (we can't know how many tasks were overdue last Tuesday). The overdue trend chart only works after InsightSnapshot data begins accumulating. Before that, show current overdue count only.

---

## 7. Implementation Phases

### Phase 1: Completion Rate + Capture/Processing Rate Charts

**Goal:** The two most valuable insights — "am I getting things done?" and "is my inbox under control?"

**New files:**
- `src/app/(dashboard)/insights/page.tsx` — Page route
- `src/components/insights/InsightsPage.tsx` — Layout with time range selector
- `src/components/insights/CompletionRateChart.tsx` — Bar chart with trend line
- `src/components/insights/CaptureProcessingChart.tsx` — Dual-line chart
- `src/app/api/insights/route.ts` — API endpoint (initial: completion + capture data)

**Modified files:**
- `src/components/layout/nav.tsx` — Add "Insights" nav item to Reflect section

**Files touched:** 6

### Phase 2: Context + Energy Distribution

**Goal:** "Where and how do I work?"

**New files:**
- `src/components/insights/ContextDistributionChart.tsx` — Donut chart
- `src/components/insights/EnergyDistributionChart.tsx` — Horizontal bar chart

**Modified files:**
- `src/app/api/insights/route.ts` — Add context + energy aggregation queries

**Files touched:** 3

### Phase 3: Weekly Review Streak + Inbox Zero Streak

**Goal:** Habit tracking for GTD's most important rituals.

**New files:**
- `src/components/insights/ReviewStreakWidget.tsx` — Streak number + week heatmap
- `src/components/insights/InboxZeroWidget.tsx` — Streak stat card

**Modified files:**
- `src/app/api/insights/route.ts` — Add streak calculations

**Files touched:** 3

### Phase 4: System Health Score

**Goal:** The composite metric that answers "is my system working?"

**New files:**
- `src/components/insights/HealthScoreWidget.tsx` — Gauge/grade display with factor breakdown

**Modified files:**
- `src/app/api/insights/route.ts` — Add health score computation

**Files touched:** 2

### Phase 5: Time-to-Done + Overdue Trend

**Goal:** Advanced analytics for power users.

**New files:**
- `src/components/insights/TimeToDoneChart.tsx` — Area chart
- `src/components/insights/OverdueTrendChart.tsx` — Area chart

**Modified files:**
- `src/app/api/insights/route.ts` — Add time-to-done + overdue aggregation

**Files touched:** 3

### Phase 6: Pre-Computed Snapshots for Performance

**Goal:** Fast page loads for users with large datasets and long time ranges.

**Schema changes:**
- Add `InsightSnapshot` model to `schema.prisma`
- Migration: `npx prisma migrate dev --name add-insight-snapshot`

**New files:**
- `src/app/api/cron/insights/route.ts` — Daily snapshot generation cron

**Modified files:**
- `prisma/schema.prisma`
- `src/app/api/insights/route.ts` — Use snapshots for long ranges (>90d), fall back to on-demand for short ranges

**Files touched:** 3

---

## 8. Key Files Reference

| File | What's There | What Changes |
|---|---|---|
| `src/app/api/dashboard/stats/route.ts` | PM dashboard stats endpoint | Pattern reference for insights endpoint |
| `src/components/dashboard/VelocityWidget.tsx` | Recharts area chart | Pattern reference for chart components |
| `src/components/dashboard/DashboardGrid.tsx` | Dashboard grid layout | Pattern reference for insights grid |
| `src/components/layout/nav.tsx` | Sidebar navigation sections | Add Insights nav item |
| `prisma/schema.prisma` | All models | Phase 6: add InsightSnapshot |

---

## 9. What This Spec Does Not Cover

- **Comparative analytics** — comparing your metrics to other users or benchmarks. Tandem is personal-first; no cross-user comparisons.
- **Export / reports** — exporting insights as PDF or CSV. Could be a future feature.
- **Real-time updates** — the insights page loads data on mount. No WebSocket-driven live updates.
- **Goal progress charts** — goal-level analytics (progress over time per goal). Could be added as an extension to the goals page rather than the insights page.
- **Team insights** — aggregate metrics across team members. Requires the Teams feature and raises privacy questions.
- **Custom metrics** — user-defined dashboards with custom widgets. The metric set is fixed for now.
- **MCP tools for insights** — no MCP tool for querying insights data. Could be added for AI-powered productivity coaching.
- **Notifications / alerts** — "Your inbox has been above 20 items for 3 days." Alerts based on insights thresholds are a separate feature.
