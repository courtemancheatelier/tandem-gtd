# Tandem Feature Spec: Gantt Charts, Critical Path, Sub-Projects & PM Views

**Version:** 1.0  
**Date:** February 21, 2026  
**Author:** Jason Courtemanche  
**Status:** Draft  

---

## 1. Executive Summary

This specification defines four interconnected feature sets that extend Tandem's GTD foundation with visual project management capabilities. Together, these features transform Tandem from a next-action engine into a full project planning and execution platform — while preserving the GTD philosophy that context-driven views, not project drill-downs, are the primary work surface.

**The core insight:** Tandem already has the data model primitives these features need. The `parentProjectId` relation supports sub-projects. The `dependsOn/dependents` relation and cascade engine provide the dependency graph that powers both Gantt visualization and critical path analysis. The `estimatedMinutes`, `dueDate`, and `scheduledDate` fields provide the temporal data. This spec is primarily about building **views, algorithms, and UI** on top of existing infrastructure.

### Feature Overview

| Feature | What It Does | Priority | Complexity |
|---------|-------------|----------|------------|
| **Gantt Chart View** | Interactive timeline visualization of tasks, dependencies, and milestones across projects | P1 — High | High |
| **Critical Path Analysis** | Identifies the longest dependency chain to surface schedule risk and bottlenecks | P1 — High | Medium |
| **Sub-Projects** | Nest projects within parent projects for hierarchical breakdown of complex outcomes | P1 — High | Medium |
| **PM Dashboard Views** | Progress tracking, resource load, milestone timelines, and health indicators | P2 — Medium | Medium |

---

## 2. Sub-Projects: Hierarchical Project Decomposition

Sub-projects are the foundation feature — the other features become dramatically more useful once projects can be broken into smaller, manageable pieces. This maps directly to how real life works: "Build Tandem" is a project, but so is "Implement Cascade Engine" within it.

### 2.1 Data Model

The Prisma schema already includes the self-referential relation needed:

```prisma
model Project {
  parentProjectId  String?   @map("parent_project_id")
  parentProject    Project?  @relation("ProjectChildren",
    fields: [parentProjectId], references: [id], onDelete: SetNull)
  childProjects    Project[] @relation("ProjectChildren")
}
```

**Schema additions needed:**

```prisma
model Project {
  // New fields
  depth           Int       @default(0)              // 0 = root, 1 = child, 2 = grandchild
  path            String    @default("")             // Materialized path: "/rootId/childId/"
  rollupProgress  Float?    @map("rollup_progress")  // 0.0-1.0 aggregate completion
  rollupStatus    ProjectStatus? @map("rollup_status") // Computed worst-case child status
}
```

### 2.2 Depth & Nesting Rules

| Depth | Name | Description | Example |
|-------|------|-------------|---------|
| 0 | Root Project | Top-level outcome. Appears in standard project list. | Build Tandem v2 |
| 1 | Sub-Project | A distinct workstream under a root. Has its own tasks and type. | Implement Gantt View |
| 2 | Work Package | Granular chunk. Max nesting depth. Prevents over-engineering. | Gantt: Render Timeline Bars |

**Max depth of 3 is enforced at the API level.** This is a deliberate constraint. GTD is about clarity, and deeply nested project trees create the kind of over-planning that kills execution. Three levels gives you enough hierarchy without falling into the Jira trap of tickets-within-epics-within-initiatives-within-themes paralysis.

### 2.3 Behavior Rules

- **Inheritance of project type:** Child projects default to the parent's type (Sequential/Parallel/Single Actions) but can be overridden. A Sequential parent can have a Parallel child.
- **Status propagation (upward):** A parent project's `rollupStatus` is the worst-case of its children. If any child is `ON_HOLD`, parent shows `ON_HOLD`. If all children are `COMPLETE`, parent auto-completes.
- **Status propagation (downward):** Pausing or archiving a parent cascades to all children. Reactivating a parent restores children to their previous individual states.
- **Progress aggregation:** `rollupProgress` = weighted average of child project completion (weight = total task count per child). Displayed as an aggregate progress bar on the parent.
- **Cross-project dependencies:** Tasks in sibling sub-projects can depend on each other using the existing `dependsOn` relation. The cascade engine already handles cross-project promotion — no changes needed.
- **Area/Goal inheritance:** Child projects inherit the parent's `areaId` and `goalId` by default. Can be overridden for cross-cutting work.

### 2.4 UI: Project Tree View

Projects with children render as expandable tree nodes in the project list. Each node shows its own progress bar plus the rollup indicator.

```
▼ Build Tandem v2                    [=========>   ] 72%  ACTIVE
    ▼ Backend API                     [============>] 95%  ACTIVE
        Cascade Engine               [=============] 100% COMPLETE
        REST Endpoints               [==========>  ]  85% ACTIVE
    ▶ Frontend UI                     [=====>       ]  45% ACTIVE
    ▶ AI Integration                  [==>          ]  20% ACTIVE
```

### 2.5 API Endpoints

```
POST   /api/projects/:id/children          Create sub-project under parent
GET    /api/projects/:id/tree               Full project tree with rollups
PATCH  /api/projects/:id/move               Reparent a project
```

### 2.6 Implementation Notes

- When creating a child project, compute `depth = parent.depth + 1` and `path = parent.path + parent.id + "/"`. Reject if depth > 2.
- The materialized `path` field enables efficient ancestor/descendant queries: `WHERE path LIKE '/rootId/%'` returns the entire subtree without recursion.
- `rollupProgress` and `rollupStatus` are recomputed on: task completion, task creation/deletion, child project status change. Use a debounced recalc (not per-event) if performance becomes a concern.
- When a parent project is paused/archived, store each child's current status in a `previousStatus` field (new, nullable) before cascading, so reactivation restores the correct state.

---

## 3. Gantt Chart View

The Gantt chart is the headline visual feature. It provides a time-based view of project execution, showing task durations, dependencies, milestones, and progress at a glance. Unlike traditional PM tools, Tandem's Gantt is read-mostly and generated from GTD data rather than being the primary planning surface.

### 3.1 Design Philosophy: GTD-Native Gantt

Most Gantt chart implementations assume waterfall-style planning: you lay out the entire schedule upfront, then execute against it. That's fundamentally at odds with GTD, which emphasizes next actions and adaptive replanning during weekly reviews.

**Tandem's approach:** The Gantt is a *visualization of current reality*, not a *mandate for future execution*. It answers the questions "Where are we?", "What's blocking progress?", and "Will we hit our deadline?" without forcing the user to micromanage a schedule.

### 3.2 Data Requirements

The Gantt view consumes data already present on the Task model plus a few additions:

| Field | Status | Source | Usage in Gantt |
|-------|--------|--------|----------------|
| `scheduledDate` | Exists | `Task.scheduledDate` | Bar start position (left edge) |
| `dueDate` | Exists | `Task.dueDate` | Bar end position (right edge) |
| `estimatedMinutes` | Exists | `Task.estimatedMinutes` | Duration calc when no due date set |
| `actualMinutes` | Exists | `Task.actualMinutes` | Actual vs. estimated overlay |
| `dependsOn` | Exists | `Task.dependsOn[]` | Dependency arrows between bars |
| `status` | Exists | `Task.status` | Bar color/fill (complete, in-progress, blocked) |
| `completedAt` | Exists | `Task.completedAt` | Actual completion marker |
| `isMilestone` | **NEW** | `Task.isMilestone` | Diamond marker instead of bar |
| `percentComplete` | **NEW** | `Task.percentComplete` | Partial fill inside bar (0–100) |

**New fields to add to Task model:**

```prisma
model Task {
  // New fields
  isMilestone      Boolean     @default(false) @map("is_milestone")
  percentComplete  Int         @default(0) @map("percent_complete") // 0-100
}
```

### 3.3 Visual Layout

The Gantt view is divided into two panels:

- **Left panel (task list):** A collapsible tree showing project hierarchy (parent project → sub-projects → tasks). Columns: Task Name, Assigned Context, Duration, Start, End, Status.
- **Right panel (timeline):** Horizontal bars aligned to a time axis. Zoom levels: Day, Week, Month, Quarter. Today marker as a vertical red dashed line.

**Bar rendering rules:**

| Task State | Bar Style | Fill | Indicator |
|-----------|-----------|------|-----------|
| NOT_STARTED | Outlined, hollow | No fill | Gray border |
| IN_PROGRESS | Solid, partial fill | Blue proportional fill | percentComplete overlay |
| COMPLETE | Solid, full | Green with checkmark | completedAt marker |
| PAUSED | Hatched pattern | Yellow diagonal stripes | Pause icon |
| BLOCKED | Solid, no fill | Red border, lock icon | Red dependency arrows |
| Milestone | Diamond shape | Navy fill | No duration bar |
| Summary (project) | Bracket/chevron shape | Dark gray endpoints | Spans child tasks |

### 3.4 Dependency Arrows

Dependencies render as SVG arrows connecting task bars. Tandem supports four dependency types to cover real-world scheduling needs:

| Type | Meaning | Arrow | Example |
|------|---------|-------|---------|
| FS | Finish-to-Start (default) | End of A → Start of B | Cut fabric → Sew seams |
| SS | Start-to-Start | Start of A → Start of B | Pour concrete + Set rebar (start together) |
| FF | Finish-to-Finish | End of A → End of B | Testing finishes when coding finishes |
| SF | Start-to-Finish | Start of A → End of B | Night shift starts → Day shift ends |

**Schema change — explicit dependency join table:**

> ⚠️ **BREAKING MIGRATION:** This replaces the existing implicit many-to-many `dependsOn/dependents` relation on `Task` with an explicit join table. Requires data migration from implicit relation to explicit table. Finish-to-Start with 0 lag is functionally identical to the current behavior.

```prisma
model TaskDependency {
  id              String         @id @default(cuid())
  predecessorId   String         @map("predecessor_id")
  predecessor     Task           @relation("Predecessor", fields: [predecessorId], references: [id])
  successorId     String         @map("successor_id")
  successor       Task           @relation("Successor", fields: [successorId], references: [id])
  type            DependencyType @default(FINISH_TO_START)
  lagMinutes      Int            @default(0)    // Positive = lag, negative = lead

  @@unique([predecessorId, successorId])
  @@map("task_dependencies")
}

enum DependencyType {
  FINISH_TO_START
  START_TO_START
  FINISH_TO_FINISH
  START_TO_FINISH
}
```

**Update Task model relations:**

```prisma
model Task {
  // Replace the implicit M2M:
  //   dependsOn   Task[] @relation("TaskDependencies")
  //   dependents  Task[] @relation("TaskDependencies")
  // With explicit:
  predecessors  TaskDependency[] @relation("Successor")
  successors    TaskDependency[] @relation("Predecessor")
}
```

**Migration script outline:**

```sql
-- 1. Create new task_dependencies table
-- 2. INSERT INTO task_dependencies (id, predecessor_id, successor_id, type, lag_minutes)
--    SELECT gen_random_uuid(), A, B, 'FINISH_TO_START', 0
--    FROM _TaskDependencies;  -- implicit Prisma join table
-- 3. Drop old _TaskDependencies table
-- 4. Update Prisma schema to use explicit model
```

### 3.5 Interactions

- **Drag to reschedule:** Dragging a bar horizontally updates `scheduledDate` and `dueDate`. Dependents auto-shift if they would overlap (with confirmation dialog).
- **Drag to resize:** Dragging bar edges changes duration (adjusts `dueDate` or `scheduledDate`).
- **Draw dependency:** Drag from one bar's edge to another to create a dependency. Hold Shift to select dependency type.
- **Click bar:** Opens task detail panel (same as clicking a task anywhere in the app).
- **Collapse/expand:** Project and sub-project rows collapse to show summary bars spanning their children.
- **Filter:** The standard Tandem filter bar (context, energy, status) applies to the Gantt view. Critical path toggle highlights the critical chain in red.
- **Baseline comparison:** Toggle to show original schedule as ghost bars behind current bars. Baseline captured at project creation or on-demand snapshot.

### 3.6 Auto-Scheduling Engine

For tasks without explicit dates, Tandem can auto-calculate positions based on dependencies and estimated durations. This runs as an **optional action** ("Auto-schedule this project") rather than always-on, preserving GTD's flexibility.

- **Forward pass:** Starting from the earliest task, calculate Early Start (ES) and Early Finish (EF) for each task using: `EF = ES + duration`, and `successor ES = max(predecessor EF + lag)` for all predecessors.
- **Backward pass:** Starting from the project deadline (dueDate on root project), calculate Late Start (LS) and Late Finish (LF): `LS = LF − duration`, and `predecessor LF = min(successor LS − lag)`.
- **Float/Slack:** `Total Float = LS − ES` (or `LF − EF`). Tasks with zero float are on the critical path.

### 3.7 API Endpoints

```
GET    /api/projects/:id/gantt              Gantt data (tasks, deps, dates, bars)
POST   /api/projects/:id/auto-schedule      Run auto-scheduling engine
POST   /api/projects/:id/baseline           Capture schedule baseline snapshot
GET    /api/projects/:id/baseline/:baselineId  Fetch baseline for comparison
POST   /api/tasks/:id/dependencies           Add dependency (with type + lag)
DELETE /api/tasks/:id/dependencies/:depId     Remove dependency
GET    /api/tasks/:id/dependency-graph        Visualize dependency chain
```

### 3.8 Baseline Snapshot Model

```prisma
model BaselineSnapshot {
  id          String   @id @default(cuid())
  projectId   String   @map("project_id")
  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  userId      String   @map("user_id")
  user        User     @relation(fields: [userId], references: [id])
  name        String   // e.g., "Sprint 1 Plan", "Pre-launch baseline"
  snapshotData Json    @map("snapshot_data") // Serialized task dates + durations at capture time
  createdAt   DateTime @default(now()) @map("created_at")

  @@index([projectId])
  @@map("baseline_snapshots")
}
```

The `snapshotData` JSON stores an array of `{ taskId, scheduledDate, dueDate, estimatedMinutes, status }` for each task in the project tree at snapshot time.

---

## 4. Critical Path Analysis

Critical Path Method (CPM) identifies the longest chain of dependent tasks through a project. Any delay on a critical path task delays the entire project. This is the most valuable project management insight Tandem can provide.

### 4.1 Algorithm

The critical path computation reuses the forward/backward pass from the auto-scheduling engine:

```typescript
interface CriticalPathNode {
  taskId: string;
  title: string;
  duration: number;       // in minutes
  ES: number;             // Early Start
  EF: number;             // Early Finish
  LS: number;             // Late Start
  LF: number;             // Late Finish
  totalFloat: number;     // LS - ES
  isCritical: boolean;    // totalFloat === 0
  predecessors: { nodeId: string; type: DependencyType; lag: number }[];
  successors: { nodeId: string; type: DependencyType; lag: number }[];
}

interface CriticalPathResult {
  criticalTasks: CriticalPathNode[];
  projectDuration: number;   // Total duration in minutes
  paths: string[][];         // Array of taskId chains forming critical paths
  bottleneck: {              // Task with most dependents on critical path
    taskId: string;
    title: string;
    dependentCount: number;
  } | null;
}

function computeCriticalPath(projectId: string): CriticalPathResult {
  // 1. Build DAG from tasks + dependencies (include sub-project tasks)
  const graph = buildDependencyGraph(projectId, { includeSubProjects: true });

  // 2. Topological sort (detect cycles → error with user-friendly message)
  const sorted = topologicalSort(graph);
  // If cycle detected, throw with: "Circular dependency found: Task A → Task B → Task C → Task A"

  // 3. Forward pass: ES, EF for each node
  for (const node of sorted) {
    node.ES = Math.max(
      ...node.predecessors.map(p => {
        const pred = graph.get(p.nodeId)!;
        switch (p.type) {
          case 'FINISH_TO_START': return pred.EF + p.lag;
          case 'START_TO_START': return pred.ES + p.lag;
          case 'FINISH_TO_FINISH': return pred.EF + p.lag - node.duration;
          case 'START_TO_FINISH': return pred.ES + p.lag - node.duration;
        }
      }),
      0
    );
    node.EF = node.ES + node.duration;
  }

  // 4. Backward pass: LF, LS from project deadline
  const projectEF = Math.max(...sorted.map(n => n.EF));
  for (const node of [...sorted].reverse()) {
    node.LF = Math.min(
      ...node.successors.map(s => {
        const succ = graph.get(s.nodeId)!;
        switch (s.type) {
          case 'FINISH_TO_START': return succ.LS - s.lag;
          case 'START_TO_START': return succ.LS - s.lag + node.duration;
          case 'FINISH_TO_FINISH': return succ.LF - s.lag;
          case 'START_TO_FINISH': return succ.LF - s.lag + node.duration;
        }
      }),
      projectEF
    );
    node.LS = node.LF - node.duration;
    node.totalFloat = node.LS - node.ES;
    node.isCritical = node.totalFloat === 0;
  }

  // 5. Extract critical path(s) and find bottleneck
  const criticalTasks = sorted.filter(n => n.isCritical);
  return {
    criticalTasks,
    projectDuration: projectEF,
    paths: traceCriticalPaths(sorted),
    bottleneck: findBottleneck(criticalTasks),
  };
}
```

### 4.2 UI Integration

- **Gantt view overlay:** Toggle "Show Critical Path" highlights critical tasks with red bars and bold red dependency arrows. Non-critical tasks fade to 40% opacity.
- **Float indicator:** Each non-critical task shows a faint extension to its bar representing available float (slack). Hover shows "This task can slip X days without affecting the deadline."
- **Risk badges:** Tasks on the critical path with no `estimatedMinutes` get a warning badge: "Missing duration estimate — critical path accuracy reduced."
- **Dashboard widget:** A Critical Path Summary card shows: longest path length, number of critical tasks, nearest critical deadline, and bottleneck task (critical task with most dependents).

### 4.3 Cross-Sub-Project Critical Path

When a root project has sub-projects, the critical path can span across them. The algorithm treats the entire sub-project tree as a single DAG, with cross-project dependencies creating edges between sub-graphs. This surfaces insights like: "The Frontend sub-project can't start its API integration tasks until the Backend sub-project delivers the REST endpoints — and that handoff is on the critical path."

### 4.4 Live Recalculation

The critical path recalculates on every relevant event:

- Task completed (cascade engine already fires; piggyback on this)
- Task duration estimate changed
- Dependency added or removed
- Task dates modified
- Sub-project structure changed

**Performance target:** Critical path computation should complete in under 100ms for projects with up to 500 tasks. For larger projects, use a debounced background job with cache.

### 4.5 API Endpoint

```
GET /api/projects/:id/critical-path    Compute & return critical path
```

Response shape matches `CriticalPathResult` interface above.

---

## 5. Project Management Dashboard Views

These views complement the Gantt chart by providing aggregate metrics and health indicators. They answer the question: "Across all my active projects, what needs attention?"

### 5.1 Project Health Dashboard

A single-screen overview of all active root projects (with sub-project rollups):

| Widget | What It Shows | Data Source |
|--------|--------------|-------------|
| **Health Score** | Red/Yellow/Green per project based on: % overdue tasks, critical path risk, stale next actions | Composite formula |
| **Progress Bars** | Completion % for each project with sub-project breakdown | `rollupProgress` |
| **Burn-Down Chart** | Remaining effort over time (estimatedMinutes vs. actualMinutes) | Task time data |
| **Velocity Tracker** | Tasks completed per week trend line | `completedAt` timestamps |
| **Blocked Queue** | All tasks currently blocked across projects with their blockers | Cascade engine state |
| **Stale Projects** | Projects with no task activity in 14+ days | `updatedAt` comparison |
| **Upcoming Milestones** | Timeline of milestones within next 30 days | `isMilestone` + `dueDate` |

**Health Score formula:**

```typescript
function computeHealthScore(projectId: string): 'GREEN' | 'YELLOW' | 'RED' {
  const metrics = {
    overduePercent: countOverdueTasks(projectId) / countTotalTasks(projectId),
    hasCriticalPathRisk: criticalPath.criticalTasks.some(t => !t.estimatedMinutes),
    staleNextActions: countStaleNextActions(projectId, 7), // no activity in 7 days
    blockedPercent: countBlockedTasks(projectId) / countTotalTasks(projectId),
  };

  if (metrics.overduePercent > 0.3 || metrics.blockedPercent > 0.5) return 'RED';
  if (metrics.overduePercent > 0.1 || metrics.hasCriticalPathRisk || metrics.staleNextActions > 3) return 'YELLOW';
  return 'GREEN';
}
```

### 5.2 Milestone Timeline

A horizontal timeline showing all milestones across projects, color-coded by project. Milestones are tasks with `isMilestone = true` and typically have zero duration. They mark meaningful completion points: "MVP feature-complete", "User testing round 1 done", "Ship to production."

**GTD integration:** Milestones map to the GTD concept of "what does done look like?" (the `successOutcome` field on projects). When a sub-project's final task completes, its milestone auto-completes via the cascade engine.

### 5.3 Workload / Capacity View

For personal GTD use, this shows energy allocation rather than team resource management. It visualizes how estimated task durations distribute across contexts and energy levels for the current and upcoming weeks.

- **Weekly energy map:** Stacked bar chart: X-axis = days, Y-axis = estimated hours. Bars segmented by energy level (High/Medium/Low). Helps identify days overloaded with high-energy tasks.
- **Context balance:** Donut chart showing time allocation by context (@home, @computer, @errands). Reveals imbalances like 80% of work requiring @computer when the user wants more @home balance.
- **GTD alignment:** This directly supports the "Am I connected?" decision check — it makes visible whether the planned work distribution matches desired energy rhythms.

### 5.4 Dashboard API Endpoints

```
GET /api/dashboard/project-health      Aggregate health across projects
GET /api/dashboard/milestones          Upcoming milestones timeline
GET /api/dashboard/workload            Energy/context distribution
```

---

## 6. Technical Architecture

### 6.1 Schema Changes Summary

| Model | Change | Migration Impact |
|-------|--------|-----------------|
| **Project** | Add `depth`, `path`, `rollupProgress`, `rollupStatus` fields | Non-breaking. Default values for existing rows. |
| **Task** | Add `isMilestone` (Boolean), `percentComplete` (Int 0–100) | Non-breaking. Default `false` / `0`. |
| **TaskDependency** | **NEW** explicit join table replacing implicit M2M. Add `type` (DependencyType), `lagMinutes` | ⚠️ Breaking migration. Requires data migration from implicit relation to explicit table. |
| **BaselineSnapshot** | **NEW** model for schedule snapshots | New table, no migration impact. |

### 6.2 Complete Schema Additions

```prisma
// ============================================================================
// UPDATED: Project model additions
// ============================================================================
model Project {
  // ... existing fields ...

  // NEW: Sub-project hierarchy
  depth           Int            @default(0)
  path            String         @default("")
  rollupProgress  Float?         @map("rollup_progress")
  rollupStatus    ProjectStatus? @map("rollup_status")

  // NEW: Baseline snapshots
  baselines       BaselineSnapshot[]
}

// ============================================================================
// UPDATED: Task model changes
// ============================================================================
model Task {
  // ... existing fields ...

  // NEW: PM features
  isMilestone      Boolean     @default(false) @map("is_milestone")
  percentComplete  Int         @default(0) @map("percent_complete")

  // CHANGED: Replace implicit dependsOn/dependents with explicit:
  predecessors     TaskDependency[] @relation("Successor")
  successors       TaskDependency[] @relation("Predecessor")
}

// ============================================================================
// NEW: Explicit dependency join table
// ============================================================================
model TaskDependency {
  id              String         @id @default(cuid())
  predecessorId   String         @map("predecessor_id")
  predecessor     Task           @relation("Predecessor", fields: [predecessorId], references: [id], onDelete: Cascade)
  successorId     String         @map("successor_id")
  successor       Task           @relation("Successor", fields: [successorId], references: [id], onDelete: Cascade)
  type            DependencyType @default(FINISH_TO_START)
  lagMinutes      Int            @default(0)

  @@unique([predecessorId, successorId])
  @@index([predecessorId])
  @@index([successorId])
  @@map("task_dependencies")
}

enum DependencyType {
  FINISH_TO_START
  START_TO_START
  FINISH_TO_FINISH
  START_TO_FINISH
}

// ============================================================================
// NEW: Baseline snapshots for Gantt comparison
// ============================================================================
model BaselineSnapshot {
  id           String   @id @default(cuid())
  projectId    String   @map("project_id")
  project      Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  userId       String   @map("user_id")
  user         User     @relation(fields: [userId], references: [id])
  name         String
  snapshotData Json     @map("snapshot_data")
  createdAt    DateTime @default(now()) @map("created_at")

  @@index([projectId])
  @@map("baseline_snapshots")
}
```

### 6.3 Cascade Engine Updates

The existing cascade engine (`src/lib/cascade.ts`) needs these extensions:

1. **Dependency type awareness:** Currently all dependencies are implicit Finish-to-Start. Update `onTaskComplete` to check `DependencyType` before promoting successors. For Start-to-Start deps, promotion happens when predecessor *starts*, not completes.

2. **Lag/Lead time:** When `lagMinutes > 0`, the successor's `scheduledDate` is set to predecessor completion + lag. Negative lag (lead time) allows overlap.

3. **Sub-project rollup:** After project completion check, traverse up parent chain recalculating `rollupProgress` and `rollupStatus` at each level.

4. **Milestone auto-detection:** When all tasks feeding into a milestone's dependencies complete, the milestone auto-completes (it has zero duration).

5. **Critical path cache invalidation:** After any cascade event, invalidate the critical path cache for the affected project tree.

**Key cascade changes (pseudocode):**

```typescript
// In onTaskComplete(), update the dependency check:
async function checkDependentsForPromotion(completedTask: Task) {
  const deps = await prisma.taskDependency.findMany({
    where: { predecessorId: completedTask.id },
    include: { successor: true },
  });

  for (const dep of deps) {
    switch (dep.type) {
      case 'FINISH_TO_START':
        // Current behavior: check if ALL predecessors of successor are complete
        const allPredsComplete = await allPredecessorsComplete(dep.successorId);
        if (allPredsComplete) {
          const startDate = dep.lagMinutes > 0
            ? addMinutes(completedTask.completedAt, dep.lagMinutes)
            : undefined;
          await promoteToNextAction(dep.successorId, { scheduledDate: startDate });
        }
        break;
      // ... handle other types
    }
  }

  // After promotion, recalculate rollups up the parent chain
  if (completedTask.projectId) {
    await recalculateProjectRollups(completedTask.projectId);
  }
}

async function recalculateProjectRollups(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { childProjects: true, tasks: true },
  });
  if (!project) return;

  // Calculate progress from own tasks + child rollups
  const ownTaskCount = project.tasks.length;
  const ownCompleted = project.tasks.filter(t => t.status === 'COMPLETED').length;

  let totalWeight = ownTaskCount;
  let totalCompleted = ownCompleted;

  for (const child of project.childProjects) {
    const childTaskCount = await prisma.task.count({ where: { projectId: child.id } });
    totalWeight += childTaskCount;
    totalCompleted += childTaskCount * (child.rollupProgress ?? 0);
  }

  const rollupProgress = totalWeight > 0 ? totalCompleted / totalWeight : 0;

  // Worst-case status from children
  const childStatuses = project.childProjects.map(c => c.status);
  const rollupStatus = computeWorstCaseStatus(childStatuses);

  await prisma.project.update({
    where: { id: projectId },
    data: { rollupProgress, rollupStatus },
  });

  // Recurse up to parent
  if (project.parentProjectId) {
    await recalculateProjectRollups(project.parentProjectId);
  }
}
```

### 6.4 Frontend Components

| Component | Library | Notes |
|-----------|---------|-------|
| `GanttChart` | Custom SVG/Canvas | No off-the-shelf Gantt fits GTD's data model. Build with D3.js or custom SVG rendering. |
| `GanttTaskList` | React Virtual | Left panel uses virtualized list for large project trees (500+ tasks). |
| `DependencyArrows` | SVG path drawing | Bezier curves between task bar edges. Animate on hover. |
| `CriticalPathOverlay` | SVG filter/mask | Red highlight layer on top of Gantt bars. |
| `ProjectTreeView` | Recursive React | Reusable tree component for project list and Gantt left panel. |
| `DashboardGrid` | CSS Grid + Recharts | Responsive widget grid. Each widget fetches its own data. |
| `MilestoneTimeline` | Custom SVG | Horizontal timeline with diamond markers. |
| `WorkloadChart` | Recharts | Stacked bar chart with energy level colors. |

### 6.5 MCP Tool Extensions

```typescript
// New MCP tools for AI-assisted project management
const newTools = [
  {
    name: "tandem_sub_project_create",
    description: "Create a sub-project under an existing project",
    inputSchema: {
      type: "object",
      properties: {
        parentProjectId: { type: "string", description: "ID of the parent project" },
        title: { type: "string" },
        type: { type: "string", enum: ["SEQUENTIAL", "PARALLEL", "SINGLE_ACTIONS"] },
        outcome: { type: "string" },
      },
      required: ["parentProjectId", "title"],
    },
  },
  {
    name: "tandem_auto_schedule",
    description: "Auto-schedule tasks in a project based on dependencies and estimated durations",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        startDate: { type: "string", description: "ISO date to start scheduling from" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "tandem_critical_path",
    description: "Compute the critical path for a project, identifying bottleneck tasks and schedule risk",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        includeSubProjects: { type: "boolean", description: "Include sub-project tasks in analysis" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "tandem_add_dependency",
    description: "Add a dependency between two tasks",
    inputSchema: {
      type: "object",
      properties: {
        predecessorTaskId: { type: "string" },
        successorTaskId: { type: "string" },
        type: { type: "string", enum: ["FINISH_TO_START", "START_TO_START", "FINISH_TO_FINISH", "START_TO_FINISH"] },
        lagMinutes: { type: "number", description: "Lag (positive) or lead (negative) time in minutes" },
      },
      required: ["predecessorTaskId", "successorTaskId"],
    },
  },
  {
    name: "tandem_project_tree",
    description: "Get the full project hierarchy with sub-projects, tasks, and rollup progress",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
      },
      required: ["projectId"],
    },
  },
];
```

---

## 7. Implementation Roadmap

Phased delivery aligned with dependencies between features:

### Phase 1: Foundation (Weeks 1–3)

- [ ] Migrate to explicit `TaskDependency` table with `type` and `lagMinutes` fields
- [ ] Write data migration script for existing implicit dependencies → explicit table
- [ ] Add Project `depth`, `path`, `rollupProgress`, `rollupStatus` fields
- [ ] Add Task `isMilestone`, `percentComplete` fields
- [ ] Update cascade engine for dependency types and sub-project rollups
- [ ] Build sub-project CRUD API endpoints (`/api/projects/:id/children`, `/tree`, `/move`)
- [ ] Build `ProjectTreeView` component (reusable for Gantt left panel)
- [ ] Update project list UI to show expandable tree with rollup progress bars

**Deliverable:** Sub-projects fully functional. Users can create, nest, and manage hierarchical projects. Progress rolls up automatically.

### Phase 2: Gantt Core (Weeks 4–7)

- [ ] Build Gantt timeline renderer (SVG-based, custom component)
- [ ] Implement task bar positioning from `scheduledDate`/`dueDate`/`estimatedMinutes`
- [ ] Add dependency arrow rendering (all 4 types with Bezier curves)
- [ ] Build drag interactions (reschedule, resize, draw dependency)
- [ ] Implement zoom levels (Day, Week, Month, Quarter)
- [ ] Add today marker and date axis header
- [ ] Integrate with Tandem filter system (context, energy, status)
- [ ] Build Gantt API endpoint (`/api/projects/:id/gantt`)

**Deliverable:** Functional Gantt chart view for any project, including projects with sub-projects.

### Phase 3: Critical Path (Weeks 8–9)

- [ ] Implement CPM algorithm (topological sort + forward/backward pass)
- [ ] Handle all 4 dependency types in forward/backward pass
- [ ] Build cycle detection with user-friendly error messages
- [ ] Build Gantt overlay for critical path highlighting (red bars, faded non-critical)
- [ ] Add float/slack indicators to non-critical tasks
- [ ] Implement auto-scheduling engine (optional action, not always-on)
- [ ] Add critical path API endpoint
- [ ] Build baseline snapshot model and capture/compare functionality

**Deliverable:** Critical path visible on Gantt. Auto-schedule available for projects with estimates.

### Phase 4: Dashboard & Polish (Weeks 10–12)

- [x] Build Project Health Dashboard with responsive widget grid
- [x] Implement health score formula (Red/Yellow/Green)
- [x] Build burn-down chart and velocity tracker widgets
- [x] Implement Milestone Timeline view
- [ ] Build Workload/Capacity visualization (energy map + context balance)
- [ ] Add baseline comparison overlay to Gantt
- [ ] Performance optimization for 500+ task projects
- [ ] Add MCP tool extensions for AI-assisted project planning
- [ ] Integration tests for cascade engine updates

**Deliverable:** Complete PM feature set. Dashboard provides actionable project health insights.

---

## 8. Open Questions & Decisions

| # | Question | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | Should Gantt be the default view for projects that have dates, or always opt-in? | Auto-switch vs. explicit toggle | Explicit toggle. GTD users may find Gantt distracting for simple projects. |
| 2 | Should auto-schedule overwrite manually set dates? | Overwrite vs. suggest vs. only fill blanks | Only fill blanks. Never overwrite user-set dates. |
| 3 | Should sub-project depth limit be configurable per user or fixed at 3? | Configurable vs. fixed | Fixed at 3. Simplicity over flexibility here. |
| 4 | How should the Gantt handle tasks with no dates and no estimates? | Hide, show as dots, or prompt for data | Show as dots at the end with a prompt: "Add estimates to improve your Gantt." |
| 5 | Should critical path span across unrelated root projects? | Per-project vs. cross-project | Per root project tree only. Cross-project critical path is confusing. |
| 6 | Offline/PWA: Should Gantt rendering work offline? | Online-only vs. cached | Cache the data, render offline. Edits sync when back online. |
| 7 | MCP integration: Should Claude be able to auto-schedule projects via MCP? | Yes, as a tool vs. embedded UI only | Yes — add `tandem_auto_schedule` and `tandem_critical_path` MCP tools. |

---

## 9. GTD Compatibility Notes

These features must not undermine the GTD foundation:

- **The Gantt is a view, not the system of record.** Tasks are still created through inbox processing, not by drawing bars on a timeline. The Gantt visualizes what GTD has already captured.
- **Next actions remain the primary engagement surface.** The "What Should I Do Now?" view stays the default home screen. PM views are secondary perspectives, not replacements.
- **Critical path informs weekly review, not daily work.** The weekly review template should surface critical path risks: "3 critical tasks have no next action." The daily workflow stays context-driven.
- **Sub-projects respect GTD project rules.** Every sub-project still needs a defined outcome (`successOutcome`) and at least one next action. The Project Tree View flags sub-projects that violate this.
- **Simplicity is always available.** Users who don't want PM features can ignore them entirely. No project is required to have dates, estimates, or milestones. The Gantt and dashboard gracefully degrade to a task list when data is sparse.

---

## 10. UI Research & Implementation Guidance

This section provides concrete library recommendations, interaction patterns, and visual references to guide Claude Code implementation. Without this guidance, the Gantt chart, dependency arrows, and dashboard widgets would require significant guesswork.

### 10.1 Gantt Chart: Build vs. Buy Decision

**Recommendation: Use SVAR React Gantt (MIT open-source edition) as the base component, with custom extensions.**

After evaluating the React Gantt landscape, SVAR React Gantt is the clear winner for Tandem:

| Library | License | Cost | React Native | Dependencies | Drag & Drop | Critical Path | Verdict |
|---------|---------|------|-------------|-------------|-------------|--------------|---------|
| **SVAR React Gantt** | MIT (core) | Free | Yes, built in React | ✅ Core | ✅ Core | ❌ PRO only | **Best fit** |
| Frappe Gantt | MIT | Free | No (vanilla JS, needs wrapper) | Basic only | ✅ | ❌ | Too basic |
| DHTMLX Gantt | GPLv2 (free) / Commercial | $699+ for PRO | Wrapper only | ✅ All 4 types | ✅ | ✅ PRO | GPL conflicts with Tandem |
| Bryntum Gantt | Commercial | $940+ per dev | Wrapper only | ✅ All 4 types | ✅ | ✅ | Too expensive for personal GTD app |
| react-gantt-chart | MIT | Free | Yes | Basic FS only | ✅ | ❌ | Unmaintained, limited features |

**Why SVAR React Gantt:**
- MIT licensed — free for commercial use, no GPL restrictions
- Built entirely in React (not a wrapper around a legacy JS lib) — integrates cleanly with Next.js
- TypeScript support and React 19 compatible
- Core (free) includes: task bars, summary tasks, milestones, task dependencies, hierarchical sub-tasks, drag-and-drop (move, resize), inline editing, zoom levels, dark/light themes, keyboard nav
- Handles 10k+ tasks with virtual scrolling
- Has an MCP server for AI-assisted development (useful for Claude Code integration)
- Active maintenance with regular releases (latest v2.5, January 2026)

**What we'll need to build on top of SVAR:**
- Critical path overlay (SVAR PRO has this, but we're implementing our own CPM algorithm anyway — just need the visual overlay as a custom SVG layer on top of SVAR's timeline)
- Dependency type selector UI (SVAR core supports FS dependencies; we need SS/FF/SF selector during drag-to-connect)
- Baseline comparison ghost bars (custom SVG layer behind main bars)
- Integration with Tandem's filter system (context, energy, status)
- Custom bar coloring based on Tandem task states (our NOT_STARTED/IN_PROGRESS/BLOCKED/etc. mapped to SVAR's task rendering)

**Installation:**

```bash
npm install @svar-ui/react-gantt
```

**Basic integration pattern:**

```tsx
import { Gantt } from '@svar-ui/react-gantt';
import '@svar-ui/react-gantt/all.css';

// Transform Tandem tasks → SVAR task format
function mapTandemTasksToGantt(tasks: Task[], dependencies: TaskDependency[]): GanttTask[] {
  return tasks.map(task => ({
    id: task.id,
    text: task.name,
    start: task.scheduledDate ? new Date(task.scheduledDate) : undefined,
    end: task.dueDate ? new Date(task.dueDate) : undefined,
    duration: task.estimatedMinutes ? task.estimatedMinutes / (8 * 60) : 1, // Convert to days
    progress: task.percentComplete / 100,
    parent: task.project?.parentProjectId ? task.projectId : 0, // Hierarchy
    type: task.isMilestone ? 'milestone' : task.childTasks?.length ? 'summary' : 'task',
  }));
}

// Transform Tandem dependencies → SVAR link format
function mapDependenciesToLinks(deps: TaskDependency[]): GanttLink[] {
  return deps.map(dep => ({
    id: dep.id,
    source: dep.predecessorId,
    target: dep.successorId,
    type: mapDepType(dep.type), // FS=0, SS=1, FF=2, SF=3
  }));
}

export function ProjectGanttView({ projectId }: { projectId: string }) {
  const { data } = useProjectGanttData(projectId);
  
  return (
    <Gantt
      tasks={data.tasks}
      links={data.links}
      // ... event handlers for drag, click, dependency creation
    />
  );
}
```

### 10.2 Gantt Interaction Patterns

Based on research into how Linear, Asana, Notion, and ClickUp handle timeline/Gantt views, here are the specific interaction patterns to implement:

#### Bar Drag Behavior (3 distinct drag modes)

Claude Code should implement these as separate interaction states, not a single drag handler:

| Drag Target | Cursor | Action | Feedback |
|-------------|--------|--------|----------|
| **Bar body** | `grab` → `grabbing` | Move entire bar horizontally (reschedule) | Ghost outline shows original position. Tooltip shows new dates. |
| **Bar left edge** (4px handle) | `col-resize` | Resize start date (change `scheduledDate`) | Bar stretches/shrinks from left. Duration updates live. |
| **Bar right edge** (4px handle) | `col-resize` | Resize end date (change `dueDate`) | Bar stretches/shrinks from right. Duration updates live. |
| **Bar connector dot** (appears on hover at bar edges) | `crosshair` | Draw dependency arrow to another bar | Rubber-band line follows cursor. Snap to target bar on hover. |

**Dependent auto-shift:** When a bar is dragged and it would cause a successor to overlap (violating FS dependency), show a confirmation dialog: "This will shift 3 dependent tasks forward by 2 days. Continue?" If confirmed, cascade the date shift. If cancelled, snap back.

**Key UX insight from Asana's Timeline design:** Asana deliberately removed the left-panel task list (traditional Gantt) in favor of a "fluid" layout where tasks float freely on the timeline canvas. For Tandem, keep the split panel (left list + right timeline) because GTD users need to see task metadata (context, energy, status) alongside the timeline. But make the left panel collapsible for a full-width timeline view.

**Key UX insight from Linear's Timeline:** Linear shows estimated completion as a projected range beyond the planned bar (purple = no target date estimate, red = projected to exceed deadline). Implement this for Tandem — when a task has `estimatedMinutes` but no `dueDate`, show a faint projected bar based on estimated duration.

#### Zoom Levels

| Level | Time unit per column | Best for | Column width |
|-------|---------------------|----------|-------------|
| Day | 1 day | Sprint-level planning (1-2 weeks) | 40px |
| Week | 1 week | Monthly planning | 80px |
| Month | 1 month | Quarterly roadmap | 120px |
| Quarter | 3 months | Annual overview | 160px |

Implement smooth zoom transitions (CSS scale + re-render at new granularity). Ctrl+Scroll or pinch gesture to zoom. Today marker (vertical dashed red line) always visible at current position.

#### Keyboard Navigation

| Key | Action |
|-----|--------|
| `←` / `→` | Move selected bar by 1 time unit |
| `Shift+←` / `Shift+→` | Resize selected bar by 1 time unit |
| `Tab` / `Shift+Tab` | Navigate between bars |
| `Enter` | Open task detail panel |
| `D` | Start drawing dependency from selected bar |
| `Delete` | Remove selected dependency arrow |
| `T` | Scroll to today |
| `+` / `-` | Zoom in / out |

### 10.3 Dependency Arrow Rendering

Dependency arrows are the most visually complex element. Implement as an SVG overlay layer positioned above the Gantt bars.

**Arrow routing algorithm:**

```
For Finish-to-Start (FS):
  1. Start point: right edge center of predecessor bar
  2. End point: left edge center of successor bar
  3. If successor is to the right: straight horizontal line with right-angle turns
  4. If successor is above/below: vertical segment down/up, then horizontal to target
  5. Arrow head: 8px solid triangle at end point

Path calculation (SVG):
  M {startX} {startY}           // Start at predecessor right edge
  H {startX + 12}               // Short horizontal stub (12px)
  V {endY}                      // Vertical to successor's row
  H {endX - 12}                 // Horizontal to near successor
  V {endY}                      // Final vertical alignment
  L {endX} {endY}               // Connect to successor left edge
```

**Arrow styles by state:**

| State | Stroke | Width | Dash | Arrow head |
|-------|--------|-------|------|------------|
| Normal | `#94A3B8` (slate-400) | 1.5px | Solid | 6px filled |
| Hover | `#3B82F6` (blue-500) | 2px | Solid | 8px filled |
| Critical path | `#EF4444` (red-500) | 2.5px | Solid | 8px filled |
| Creating (rubber-band) | `#3B82F6` (blue-500) | 1.5px | `4 4` dashed | None |
| Circular dependency error | `#EF4444` (red-500) | 2px | `2 4` dashed | 8px open |

**Hover behavior:** When hovering over an arrow, highlight both the arrow and both connected bars. Show a tooltip: "Task A → Task B (Finish-to-Start, no lag)" with a small ✕ button to delete the dependency.

### 10.4 Critical Path Visual Overlay

When "Show Critical Path" is toggled on:

1. **Critical tasks:** Bar fill changes to `#EF4444` (red-500) with white text. Border becomes 2px solid `#DC2626` (red-600).
2. **Critical dependency arrows:** Stroke changes to red, width increases to 2.5px, animated dashed pattern (CSS `stroke-dashoffset` animation for a "flowing" effect showing direction).
3. **Non-critical tasks:** Opacity reduces to 0.35. Bars become desaturated (CSS `filter: saturate(0.3) opacity(0.35)`).
4. **Float indicators:** Non-critical tasks show a faint dotted extension to the right of their bar, proportional to their total float time. Hover shows: "This task has 3 days of slack."
5. **Critical path summary banner:** Fixed at top of Gantt view: "Critical Path: 47 days across 12 tasks. Bottleneck: 'API Integration' (blocks 5 tasks)." With link to scroll to bottleneck task.

### 10.5 Project Tree View Component

The tree view appears in two places: the project list sidebar and the Gantt left panel. Build once, reuse.

**Visual spec:**

```
Component: ProjectTreeNode
├── Expand/collapse chevron (▶/▼) — only if hasChildren
├── Status icon (colored dot: green=active, yellow=on-hold, gray=complete)
├── Project/task name (truncated with ellipsis at panel width)
├── Progress bar (thin, 4px height, inline after name)
│   ├── Fill color: matches status (blue=active, green=complete)
│   └── Text overlay: "72%" right-aligned
└── Rollup indicator (if parent: shows worst-case child status as colored border-left)

Indentation: 24px per depth level
Row height: 36px (compact) or 48px (comfortable, default)
Hover: background #F1F5F9 (slate-100)
Selected: background #DBEAFE (blue-100), left border 3px solid #3B82F6
```

**Drag-to-reparent:** Allow dragging projects in the tree to reparent them. Drop target highlights with a blue insertion line (above/below for reorder, indent for nesting). Enforce max depth=3 — if user tries to nest deeper, show a toast: "Maximum nesting depth reached (3 levels)."

### 10.6 Dashboard Widget Grid

**Layout approach: CSS Grid with Recharts + Tremor**

Use CSS Grid for the dashboard layout (not a drag-and-drop grid library — keep it simple for v1). Widgets are fixed-position cards that adapt to viewport width.

**Recommended library stack:**
- **Recharts** for all chart widgets (line, bar, area, pie, radar) — already popular in the React/Next.js ecosystem, composable, works with Tailwind
- **Tremor** (`tremor.so`) for pre-styled dashboard components — built on Recharts + Radix UI + Tailwind, provides KPI cards, trackers, bar lists, and sparklines out of the box. MIT licensed.
- **shadcn/ui Charts** (`shadcn.io/charts`) — 53 pre-built chart components styled with shadcn/ui. Copy-paste into the project. Already uses Recharts under the hood.

**Installation:**

```bash
# Core charting
npm install recharts

# Optional: Tremor for pre-styled dashboard widgets
npm install @tremor/react

# Optional: shadcn chart components (install individually)
npx shadcn@latest add https://shadcn.io/r/bar-interactive.json
```

**Grid layout spec:**

```
Desktop (≥1280px):     3 columns, 16px gap
Tablet (768-1279px):   2 columns, 12px gap
Mobile (<768px):       1 column, 8px gap

Widget sizes:
- KPI card (Health Score, Velocity):    1 col × 120px height
- Progress Bars:                         2 col × 200px height
- Burn-Down Chart:                       2 col × 300px height
- Blocked Queue:                         1 col × 400px height (scrollable)
- Milestone Timeline:                    3 col × 200px height (full width)
- Stale Projects:                        1 col × 300px height (scrollable)
```

**Widget card spec:**

```
Container:
  - Background: white (dark mode: slate-900)
  - Border: 1px solid slate-200 (dark mode: slate-700)
  - Border-radius: 12px
  - Padding: 20px
  - Shadow: sm (0 1px 2px rgba(0,0,0,0.05))

Header:
  - Title: 14px semibold, slate-700
  - Subtitle/metric: 24px bold, slate-900 (the big number)
  - Trend indicator: green ▲ or red ▼ with percentage, 12px

Chart area:
  - Recharts ResponsiveContainer, 100% width
  - Consistent color palette across all widgets:
    Active/Good:  #3B82F6 (blue-500)
    Complete:     #22C55E (green-500)
    Warning:      #F59E0B (amber-500)
    Critical/Bad: #EF4444 (red-500)
    Neutral:      #94A3B8 (slate-400)
```

### 10.7 Health Score Widget

The health score is the highest-impact dashboard widget. Render as a colored badge per project.

**Visual spec:**

```
┌─────────────────────────────────────────────┐
│  Project Health                              │
│                                              │
│  ● Build Tandem v2          🟢 Healthy      │
│    ████████████░░░░  72%    ↑ 5% this week  │
│                                              │
│  ● Fashion Portfolio        🟡 At Risk      │
│    ████░░░░░░░░░░░░  28%    2 overdue tasks │
│                                              │
│  ● Tango Curriculum         🔴 Blocked      │
│    ██░░░░░░░░░░░░░░  12%    Stale 18 days   │
│                                              │
└─────────────────────────────────────────────┘
```

Traffic light colors: `GREEN = #22C55E`, `YELLOW = #F59E0B`, `RED = #EF4444`

Click on any project row → navigates to that project's Gantt view.

### 10.8 Burn-Down Chart

**Axes:**
- X-axis: dates (from project start to project deadline)
- Y-axis: remaining effort in hours (sum of `estimatedMinutes` for incomplete tasks)

**Lines:**
- **Ideal burn-down:** straight diagonal line from total effort to zero at deadline. Color: `#94A3B8` (slate-400), dashed.
- **Actual burn-down:** stepped line showing real remaining effort over time. Color: `#3B82F6` (blue-500), 2px solid.
- **Projected completion:** dashed extension of actual trend line. Color: `#F59E0B` (amber-500) if projecting past deadline, `#22C55E` (green-500) if projecting before deadline.

**Scope change indicators:** Vertical dotted lines where tasks were added/removed from the project, with a small label: "+3 tasks added" or "-2 tasks removed."

### 10.9 Workload / Energy Map

This is unique to Tandem — no reference app has this because they don't track energy levels on tasks.

**Visualization: Stacked bar chart (Recharts StackedBarChart)**

```
X-axis: Days of the week (Mon-Sun for current + next week)
Y-axis: Estimated hours

Stacked segments per bar:
  - High energy tasks:   #EF4444 (red-500) — top of stack
  - Medium energy tasks: #F59E0B (amber-500) — middle
  - Low energy tasks:    #22C55E (green-500) — bottom

Reference line: horizontal dashed line at "sustainable daily capacity" (configurable, default 6 hours)
```

Bars exceeding the capacity line get a warning highlight. Hover on any segment shows: "Tuesday: 3.5h of high-energy tasks (@computer: API development, Cascade engine refactor)"

**Context balance donut:**

```
Segments colored by context:
  @home:     #3B82F6
  @computer: #8B5CF6
  @errands:  #F59E0B
  @phone:    #22C55E
  @gym:      #EF4444

Center label: "This week" with total hours
Legend below donut with hours per context
```

### 10.10 Color Palette & Theme Integration

All PM feature colors must integrate with Tandem's existing theme system. Define as CSS custom properties:

```css
:root {
  /* Gantt bar states */
  --gantt-not-started: #94A3B8;
  --gantt-in-progress: #3B82F6;
  --gantt-complete: #22C55E;
  --gantt-paused: #F59E0B;
  --gantt-blocked: #EF4444;
  --gantt-milestone: #1E293B;
  --gantt-summary: #64748B;
  
  /* Critical path */
  --gantt-critical: #EF4444;
  --gantt-critical-arrow: #DC2626;
  --gantt-float: #CBD5E1;
  
  /* Dependency arrows */
  --gantt-arrow-normal: #94A3B8;
  --gantt-arrow-hover: #3B82F6;
  --gantt-arrow-creating: #3B82F6;
  
  /* Dashboard */
  --health-green: #22C55E;
  --health-yellow: #F59E0B;
  --health-red: #EF4444;
  
  /* Energy levels */
  --energy-high: #EF4444;
  --energy-medium: #F59E0B;
  --energy-low: #22C55E;
  
  /* Today marker */
  --gantt-today: #EF4444;
}

/* Dark mode overrides */
.dark {
  --gantt-not-started: #475569;
  --gantt-summary: #94A3B8;
  --gantt-milestone: #E2E8F0;
  /* ... adjust others for dark backgrounds */
}
```

### 10.11 Reference Links for Implementation

These resources should be bookmarked by Claude Code during implementation:

| Resource | URL | Use For |
|----------|-----|---------|
| SVAR React Gantt Docs | https://docs.svar.dev/react/gantt/overview/ | Gantt component API, configuration, events |
| SVAR React Gantt GitHub | https://github.com/svar-widgets/react-gantt | Source code, examples, issue tracker |
| SVAR Gantt Demos | https://docs.svar.dev/react/gantt/samples/ | Interactive demos of all features |
| Tremor Components | https://tremor.so/ | Pre-built dashboard widgets (KPI cards, charts, trackers) |
| shadcn/ui Charts | https://shadcn.io/charts | 53 Recharts components styled for shadcn |
| Recharts Docs | https://recharts.org/en-US/ | Chart API reference for custom widgets |
| Asana Timeline Design | https://medium.com/asana-design/designing-timeline-lessons-learned-from-our-journey-beyond-gantt-charts-645e80177aaa | UX patterns for fluid timeline interaction |
| Linear Roadmap Timeline | https://linear.app/changelog/2021-05-27-linear-preview-roadmap-timeline | Projected completion dates, estimated ranges |
| SVAR MCP Server | (included with @svar-ui/react-gantt) | AI-assisted Gantt development with Claude Code |
